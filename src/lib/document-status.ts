import {
  getStepForDocumentStatus,
} from '@/constants/document-status';
import { DocumentStatus } from '@/generated/prisma/enums';

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

/**
 * Whether work on this version has actually begun.
 *
 * A version row is not the same as a started translation: the document list
 * and an assignment both create one at PENDING_TRANSLATION, and "Back to
 * pending" returns a started one to it. In that state the app already refuses
 * to autosave and hides the save control, so the editor must not be offered
 * either -- the translation pane shows the call to action, and pressing it
 * claims the version and moves it to IN_PROGRESS.
 */
export function isTranslationStarted(status: DocumentStatus | null | undefined): boolean {
  return !!status && status !== DocumentStatus.PENDING_TRANSLATION;
}
