import { DocumentStatus } from '@/generated/prisma/enums';

/**
 * The AI workflow as the list of steps a person reads in the editor: who does
 * each one and how far the document has come. The statuses alone do not say
 * that. "In Review" names neither the AI's draft before it nor the AI's audio
 * text after it, so a reviewer could not tell which part of the document was
 * the AI's work and which part waits on the team.
 */

/** Who does a step: the AI, the language team, or the app with no model involved. */
export type AiStepActor = 'ai' | 'team' | 'app';

/** The tag a step or a board card carries for its actor. */
export const AI_ACTOR_LABEL: Record<AiStepActor, string> = { ai: 'AI', team: 'Team', app: 'App' };

export type AiStepState = 'done' | 'current' | 'failed' | 'upcoming';

export type AiStepId = 'draft' | 'text-review' | 'audio-text' | 'audio-review' | 'deploy';

export interface AiWorkflowStep {
  id: AiStepId;
  actor: AiStepActor;
  title: string;
  state: AiStepState;
}

const STEPS: { id: AiStepId; actor: AiStepActor; title: string; audioOnly?: boolean }[] = [
  { id: 'draft', actor: 'ai', title: 'Draft the translation' },
  { id: 'text-review', actor: 'team', title: 'Review the text' },
  { id: 'audio-text', actor: 'ai', title: 'Prepare the audio text', audioOnly: true },
  { id: 'audio-review', actor: 'team', title: 'Check the audio text', audioOnly: true },
  { id: 'deploy', actor: 'app', title: 'Record, deploy and merge' },
];

/** The step a status stands on, or 'finished' once the document is deployed. */
function currentStep(status: DocumentStatus): AiStepId | 'finished' {
  switch (status) {
    case DocumentStatus.PENDING_REVIEW:
      return 'text-review';
    case DocumentStatus.AI_PREPARING_AUDIO:
      return 'audio-text';
    case DocumentStatus.AUDIO_REVIEW:
      return 'audio-review';
    case DocumentStatus.APPROVED:
      return 'deploy';
    case DocumentStatus.DEPLOYED:
      return 'finished';
    default:
      // Not started, or the AI is drafting: nothing is behind the document yet.
      return 'draft';
  }
}

/**
 * The steps of one AI-workflow version, in order.
 *
 * A document that gets no audio has no audio steps, so they are left out
 * rather than shown as skipped. A version that already stands on an audio
 * step keeps them whatever `hasAudio` says, so the list never loses the step
 * the document is on.
 *
 * A failure marks the step the document stands on. A deployed version can
 * still carry one, when GitHub refused the pull request or the merge after
 * the status moved, and that failure belongs to the last step.
 */
export function aiWorkflowSteps(input: {
  status: DocumentStatus;
  hasAudio: boolean;
  aiError?: string | null;
}): AiWorkflowStep[] {
  const current = currentStep(input.status);
  const onAudioStep = current === 'audio-text' || current === 'audio-review';
  const steps = STEPS.filter((step) => !step.audioOnly || input.hasAudio || onAudioStep);
  const failed = Boolean(input.aiError);
  const currentIndex = current === 'finished' ? steps.length : steps.findIndex((step) => step.id === current);

  return steps.map(({ id, actor, title }, index) => {
    let state: AiStepState = index < currentIndex ? 'done' : index === currentIndex ? 'current' : 'upcoming';
    const isFailedStep = failed && (state === 'current' || (current === 'finished' && id === 'deploy'));
    if (isFailedStep) state = 'failed';
    return { id, actor, title, state };
  });
}
