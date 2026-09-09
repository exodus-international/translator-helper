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
 * Whether a status belongs to the drafting half of the workflow.
 *
 * PENDING_TRANSLATION, IN_PROGRESS and "no version yet" open the translate
 * editor; PENDING_REVIEW, APPROVED and DEPLOYED open review. The canonical URL
 * carries no verb, so this is what decides which editor a link opens.
 */
export function isDraftPhase(status: DocumentStatus | null | undefined): boolean {
  return !status || status === DocumentStatus.PENDING_TRANSLATION || status === DocumentStatus.IN_PROGRESS;
}
