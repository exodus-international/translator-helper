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
