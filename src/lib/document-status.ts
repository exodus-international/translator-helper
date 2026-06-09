import {
  getStepForDocumentStatus,
} from '@/constants/document-status';
import { DocumentStatus } from '@prisma/client';

/**
 * Maps DocumentStatus to stepper step number (1-5)
 */
export function getStatusStep(status: DocumentStatus | null): number {
  return getStepForDocumentStatus(status);
}


/**
 * Determines if a step should be completed based on current status
 */
export function isStepCompleted(step: number, currentStatus: DocumentStatus | null): boolean {
  const currentStep = getStatusStep(currentStatus);
  return step < currentStep;
}

/**
 * Status → editor route. PENDING_TRANSLATION / IN_PROGRESS / no-status live on
 * /translate; everything else (PENDING_REVIEW, APPROVED, DEPLOYED) lives on /review.
 * Used both for server-side guards and for client-side redirects on status change.
 */
export function getCanonicalEditorPath(
  documentId: string,
  status: DocumentStatus | null | undefined,
  options: { versionId?: string | null; lang?: string | null } = {},
): string {
  const params = new URLSearchParams();
  if (options.lang) params.set('lang', options.lang);
  if (options.versionId) params.set('version', options.versionId);
  const qs = params.toString();
  const suffix = qs ? `?${qs}` : '';

  const isDraftPhase =
    !status || status === DocumentStatus.PENDING_TRANSLATION || status === DocumentStatus.IN_PROGRESS;

  return isDraftPhase ? `/documents/${documentId}/translate${suffix}` : `/documents/${documentId}/review${suffix}`;
}
