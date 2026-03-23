import { DocumentStatus } from '@prisma/client';

// ─── Valid transitions map ───────────────────────────────────

export const VALID_TRANSITIONS: Record<DocumentStatus, DocumentStatus[]> = {
  [DocumentStatus.PENDING_TRANSLATION]: [DocumentStatus.IN_PROGRESS],
  [DocumentStatus.IN_PROGRESS]: [DocumentStatus.PENDING_TRANSLATION, DocumentStatus.PENDING_REVIEW],
  [DocumentStatus.PENDING_REVIEW]: [DocumentStatus.IN_PROGRESS, DocumentStatus.APPROVED],
  [DocumentStatus.APPROVED]: [DocumentStatus.PENDING_REVIEW, DocumentStatus.DEPLOYED],
  [DocumentStatus.DEPLOYED]: [DocumentStatus.APPROVED],
};

// ─── Transition context for guards ───────────────────────────

export interface TransitionContext {
  openSuggestionsCount?: number;
}

// ─── Validation ──────────────────────────────────────────────

export function validateTransition(
  from: DocumentStatus,
  to: DocumentStatus,
  context?: TransitionContext,
): void {
  const allowed = VALID_TRANSITIONS[from];

  if (!allowed || !allowed.includes(to)) {
    throw new Error(
      `Invalid status transition: ${from} → ${to}. Allowed transitions from ${from}: ${allowed?.join(', ') || 'none'}`,
    );
  }

  // Guards
  if (
    (to === DocumentStatus.APPROVED || to === DocumentStatus.DEPLOYED) &&
    context?.openSuggestionsCount !== undefined &&
    context.openSuggestionsCount > 0
  ) {
    throw new Error(
      `Cannot transition to ${to}: there are ${context.openSuggestionsCount} open suggestions that must be resolved first`,
    );
  }
}
