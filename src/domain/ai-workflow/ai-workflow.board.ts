import { DocumentStatus, TranslationWorkflow } from '@/generated/prisma/enums';
import { REQUIRED_TEXT_APPROVALS } from './ai-workflow.rules';

/**
 * What a board card says about an AI-workflow version. The board folds the AI
 * steps into its five columns, so without this an AI card looks like a manual
 * one: a Review card waiting on the team's approvals reads the same as one
 * waiting on its assigned reviewer.
 */

export type AiCardTone = 'working' | 'waiting' | 'failed' | 'done';

export interface AiCardStep {
  label: string;
  tone: AiCardTone;
}

interface CardVersion {
  workflow?: TranslationWorkflow | null;
  status: DocumentStatus;
  aiError?: string | null;
  /** Thumbs-up on the text so far. */
  approvalCount?: number;
}

/** Null for a manual-workflow version, which the card shows as before. */
export function aiCardStep(version: CardVersion): AiCardStep | null {
  if (version.workflow !== TranslationWorkflow.AI) return null;
  // A failed step is the one thing on the board someone has to act on.
  if (version.aiError) return { label: 'AI step failed', tone: 'failed' };

  switch (version.status) {
    case DocumentStatus.AI_TRANSLATING:
      return { label: 'AI drafting', tone: 'working' };
    case DocumentStatus.PENDING_REVIEW:
      return { label: `${version.approvalCount ?? 0}/${REQUIRED_TEXT_APPROVALS} approvals`, tone: 'waiting' };
    case DocumentStatus.AI_PREPARING_AUDIO:
      return { label: 'AI preparing audio', tone: 'working' };
    case DocumentStatus.AUDIO_REVIEW:
      return { label: 'Audio check', tone: 'waiting' };
    case DocumentStatus.APPROVED:
      return { label: 'Deploying', tone: 'working' };
    default:
      return { label: 'AI workflow', tone: 'done' };
  }
}
