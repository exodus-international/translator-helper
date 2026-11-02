import { DocumentStatus, TranslationWorkflow } from '@/generated/prisma/enums';

const NONE: DocumentStatus[] = [];

/** The manual workflow: a translator drafts, a reviewer approves, a manager deploys. */
const VALID_TRANSITIONS: Record<DocumentStatus, DocumentStatus[]> = {
  [DocumentStatus.PENDING_TRANSLATION]: [DocumentStatus.IN_PROGRESS],
  [DocumentStatus.IN_PROGRESS]: [DocumentStatus.PENDING_TRANSLATION, DocumentStatus.PENDING_REVIEW],
  [DocumentStatus.PENDING_REVIEW]: [DocumentStatus.IN_PROGRESS, DocumentStatus.APPROVED],
  [DocumentStatus.APPROVED]: [DocumentStatus.PENDING_REVIEW, DocumentStatus.DEPLOYED],
  [DocumentStatus.DEPLOYED]: [DocumentStatus.APPROVED],
  [DocumentStatus.AI_TRANSLATING]: NONE,
  [DocumentStatus.AI_PREPARING_AUDIO]: NONE,
  [DocumentStatus.AUDIO_REVIEW]: NONE,
};

/**
 * The AI workflow, every move in it. Most of them belong to the app itself
 * (see PERSON_AI_TRANSITIONS for the ones a person makes): the AI finishing a
 * draft or the audio text, the second approval of the text, the automatic
 * deploy. Nothing in it goes back to an earlier step except leaving DEPLOYED,
 * which undoes a deploy the same way it does in the manual workflow.
 *
 * PENDING_REVIEW goes straight to APPROVED when the document gets no audio.
 */
const AI_TRANSITIONS: Record<DocumentStatus, DocumentStatus[]> = {
  [DocumentStatus.PENDING_TRANSLATION]: [DocumentStatus.AI_TRANSLATING],
  [DocumentStatus.IN_PROGRESS]: NONE,
  [DocumentStatus.AI_TRANSLATING]: [DocumentStatus.PENDING_REVIEW],
  [DocumentStatus.PENDING_REVIEW]: [DocumentStatus.AI_PREPARING_AUDIO, DocumentStatus.APPROVED],
  [DocumentStatus.AI_PREPARING_AUDIO]: [DocumentStatus.AUDIO_REVIEW],
  [DocumentStatus.AUDIO_REVIEW]: [DocumentStatus.APPROVED],
  [DocumentStatus.APPROVED]: [DocumentStatus.DEPLOYED],
  [DocumentStatus.DEPLOYED]: [DocumentStatus.APPROVED],
};

/**
 * The AI-workflow moves a person makes from the status control: approving the
 * audio text, and deploying or undeploying when the automatic deploy needs a
 * hand. Approving the text is not a status move; it is a thumbs-up, and the
 * second one moves the version.
 */
const PERSON_AI_TRANSITIONS: Record<DocumentStatus, DocumentStatus[]> = {
  [DocumentStatus.PENDING_TRANSLATION]: NONE,
  [DocumentStatus.IN_PROGRESS]: NONE,
  [DocumentStatus.AI_TRANSLATING]: NONE,
  [DocumentStatus.PENDING_REVIEW]: NONE,
  [DocumentStatus.AI_PREPARING_AUDIO]: NONE,
  [DocumentStatus.AUDIO_REVIEW]: [DocumentStatus.APPROVED],
  [DocumentStatus.APPROVED]: [DocumentStatus.DEPLOYED],
  [DocumentStatus.DEPLOYED]: [DocumentStatus.APPROVED],
};

/** Who asks for a move: someone using the app, or the app's own AI workflow. */
export type TransitionActor = 'person' | 'system';

/** The statuses `from` may move to in `workflow`, for whoever asks. */
export function allowedTransitions(
  from: DocumentStatus,
  workflow: TranslationWorkflow = TranslationWorkflow.MANUAL,
  by: TransitionActor = 'person',
): DocumentStatus[] {
  if (workflow === TranslationWorkflow.MANUAL) return VALID_TRANSITIONS[from];
  return (by === 'system' ? AI_TRANSITIONS : PERSON_AI_TRANSITIONS)[from];
}

const STATUS_ORDER: Record<TranslationWorkflow, DocumentStatus[]> = {
  [TranslationWorkflow.MANUAL]: [
    DocumentStatus.PENDING_TRANSLATION,
    DocumentStatus.IN_PROGRESS,
    DocumentStatus.PENDING_REVIEW,
    DocumentStatus.APPROVED,
    DocumentStatus.DEPLOYED,
  ],
  [TranslationWorkflow.AI]: [
    DocumentStatus.PENDING_TRANSLATION,
    DocumentStatus.AI_TRANSLATING,
    DocumentStatus.PENDING_REVIEW,
    DocumentStatus.AI_PREPARING_AUDIO,
    DocumentStatus.AUDIO_REVIEW,
    DocumentStatus.APPROVED,
    DocumentStatus.DEPLOYED,
  ],
};

// Guards only apply on forward transitions to these statuses. Leaving the AI
// workflow's text review is guarded too: the AI's comments on the draft must
// be dealt with before the audio text is built from it.
const FORWARD_GUARDED_STATUSES: DocumentStatus[] = [
  DocumentStatus.APPROVED,
  DocumentStatus.DEPLOYED,
  DocumentStatus.AI_PREPARING_AUDIO,
];

/** Whether entering `to` is refused while a suggestion is still open. */
export function guardedByOpenSuggestions(to: DocumentStatus): boolean {
  return FORWARD_GUARDED_STATUSES.includes(to);
}

/**
 * A move the workflow refuses for the version as it is now: not allowed from
 * its current status, or blocked by open suggestions. The usual cause is a
 * page that went stale, so the status action returns this to the client as a
 * refusal rather than a crash.
 */
export class StatusTransitionRefusedError extends Error {
  constructor(
    message: string,
    readonly reason: 'not_allowed' | 'open_suggestions',
  ) {
    super(message);
    this.name = 'StatusTransitionRefusedError';
  }
}

interface TransitionContext {
  openSuggestionsCount?: number;
  /** MANUAL when left out. */
  workflow?: TranslationWorkflow;
  /** 'person' when left out. */
  by?: TransitionActor;
}

export function validateTransition(
  from: DocumentStatus,
  to: DocumentStatus,
  context?: TransitionContext,
): void {
  const workflow = context?.workflow ?? TranslationWorkflow.MANUAL;
  const allowed = allowedTransitions(from, workflow, context?.by);

  if (!allowed.includes(to)) {
    throw new StatusTransitionRefusedError(
      `Invalid status transition: ${from} → ${to}. Allowed transitions from ${from}: ${allowed.join(', ')}`,
      'not_allowed',
    );
  }

  // Guards only apply on forward transitions (moving up the sequence)
  const order = STATUS_ORDER[workflow];
  const isForward = order.indexOf(to) > order.indexOf(from);

  if (isForward && guardedByOpenSuggestions(to)) {
    if (context?.openSuggestionsCount === undefined) {
      throw new Error(`Transition to ${to} requires context with openSuggestionsCount`);
    }
    if (context.openSuggestionsCount > 0) {
      throw new StatusTransitionRefusedError(
        `Cannot transition to ${to}: there are ${context.openSuggestionsCount} open suggestions that must be resolved first`,
        'open_suggestions',
      );
    }
  }
}
