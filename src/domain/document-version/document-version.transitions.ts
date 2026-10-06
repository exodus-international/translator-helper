import { DocumentStatus } from '@/generated/prisma/enums';

export const VALID_TRANSITIONS: Record<DocumentStatus, DocumentStatus[]> = {
  [DocumentStatus.PENDING_TRANSLATION]: [DocumentStatus.IN_PROGRESS],
  [DocumentStatus.IN_PROGRESS]: [DocumentStatus.PENDING_TRANSLATION, DocumentStatus.PENDING_REVIEW],
  [DocumentStatus.PENDING_REVIEW]: [DocumentStatus.IN_PROGRESS, DocumentStatus.APPROVED],
  [DocumentStatus.APPROVED]: [DocumentStatus.PENDING_REVIEW, DocumentStatus.DEPLOYED],
  [DocumentStatus.DEPLOYED]: [DocumentStatus.APPROVED],
};

const STATUS_ORDER: DocumentStatus[] = [
  DocumentStatus.PENDING_TRANSLATION,
  DocumentStatus.IN_PROGRESS,
  DocumentStatus.PENDING_REVIEW,
  DocumentStatus.APPROVED,
  DocumentStatus.DEPLOYED,
];

// Guards only apply on forward transitions to these statuses
const FORWARD_GUARDED_STATUSES: DocumentStatus[] = [DocumentStatus.APPROVED, DocumentStatus.DEPLOYED];

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
  openSuggestionsCount: number;
}

export function validateTransition(
  from: DocumentStatus,
  to: DocumentStatus,
  context?: TransitionContext,
): void {
  const allowed = VALID_TRANSITIONS[from];

  if (!allowed.includes(to)) {
    throw new StatusTransitionRefusedError(
      `Invalid status transition: ${from} → ${to}. Allowed transitions from ${from}: ${allowed.join(', ')}`,
      'not_allowed',
    );
  }

  // Guards only apply on forward transitions (moving up the sequence)
  const isForward = STATUS_ORDER.indexOf(to) > STATUS_ORDER.indexOf(from);

  if (isForward && FORWARD_GUARDED_STATUSES.includes(to)) {
    if (!context) {
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
