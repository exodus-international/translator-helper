import {
  getDocumentStatusByStep,
  getDocumentStatusConfig,
  getStepForDocumentStatus,
} from "@/constants/document-status";
import { DocumentStatus } from "@prisma/client";

/**
 * Maps DocumentStatus to stepper step number (1-5)
 */
export function getStatusStep(status: DocumentStatus | null): number {
  return getStepForDocumentStatus(status);
}

/**
 * Gets the label for a stepper step
 */
export function getStepLabel(step: number): string {
  const status = getDocumentStatusByStep(step);
  if (!status) {
    return "";
  }

  return getDocumentStatusConfig(status).name;
}

/**
 * Gets a human-readable label for a document status
 */
export function getStatusLabel(status: DocumentStatus | null): string {
  return getDocumentStatusConfig(status).name;
}

/**
 * Determines if a step should be completed based on current status
 */
export function isStepCompleted(step: number, currentStatus: DocumentStatus | null): boolean {
  const currentStep = getStatusStep(currentStatus);
  return step < currentStep;
}

/**
 * Determines if a step is active based on current status
 */
export function isStepActive(step: number, currentStatus: DocumentStatus | null): boolean {
  const currentStep = getStatusStep(currentStatus);
  return step === currentStep;
}
