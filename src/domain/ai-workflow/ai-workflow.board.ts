import { DocumentStatus, TranslationWorkflow } from '@/generated/prisma/enums';
import { boardStatus } from '@/constants/document-status';
import { REQUIRED_TEXT_APPROVALS } from './ai-workflow.rules';
import type { AiStepActor } from './ai-workflow.steps';

/**
 * What a board card says about an AI-workflow version. The board folds the AI
 * steps into its five columns, so without this an AI card looks like a manual
 * one: a Review card waiting on the team's approvals reads the same as one
 * waiting on its assigned reviewer.
 */

export type AiCardTone = 'working' | 'waiting' | 'failed' | 'done';

export interface AiCardStep {
  /** Who the card waits on, as the editor's AI workflow panel tags it. Null once nobody has anything left to do. */
  actor: AiStepActor | null;
  label: string;
  tone: AiCardTone;
}

/** Who does the step a status stands on. */
function actorAt(status: DocumentStatus): AiStepActor {
  switch (status) {
    case DocumentStatus.PENDING_REVIEW:
    case DocumentStatus.AUDIO_REVIEW:
      return 'team';
    case DocumentStatus.APPROVED:
    case DocumentStatus.DEPLOYED:
      return 'app';
    default:
      return 'ai';
  }
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
  if (version.aiError) return { actor: actorAt(version.status), label: 'Step failed', tone: 'failed' };

  switch (version.status) {
    case DocumentStatus.AI_TRANSLATING:
      return { actor: 'ai', label: 'Drafting', tone: 'working' };
    case DocumentStatus.PENDING_REVIEW:
      return {
        actor: 'team',
        label: `${version.approvalCount ?? 0}/${REQUIRED_TEXT_APPROVALS} approvals`,
        tone: 'waiting',
      };
    case DocumentStatus.AI_PREPARING_AUDIO:
      return { actor: 'ai', label: 'Preparing audio', tone: 'working' };
    case DocumentStatus.AUDIO_REVIEW:
      return { actor: 'team', label: 'Audio check', tone: 'waiting' };
    case DocumentStatus.APPROVED:
      return { actor: 'app', label: 'Deploying', tone: 'working' };
    default:
      return { actor: null, label: 'AI workflow', tone: 'done' };
  }
}

/**
 * The board's columns. A language in the manual workflow keeps the five it
 * always had. A language in the AI workflow starts at the first step that
 * waits on a person: a document there is drafted as soon as it is uploaded,
 * so "Not Started" and "In Progress" would stand empty, and a column for the
 * few minutes the AI drafts would empty again before anyone read it.
 */
export type BoardColumnId = 'pending' | 'in-progress' | 'review' | 'audio' | 'approved' | 'deployed';

/** The status a card takes when it is dropped on a column, and the one the column is named after. */
export const BOARD_COLUMN_STATUS: Record<BoardColumnId, DocumentStatus> = {
  pending: DocumentStatus.PENDING_TRANSLATION,
  'in-progress': DocumentStatus.IN_PROGRESS,
  review: DocumentStatus.PENDING_REVIEW,
  audio: DocumentStatus.AUDIO_REVIEW,
  approved: DocumentStatus.APPROVED,
  deployed: DocumentStatus.DEPLOYED,
};

const MANUAL_COLUMNS: BoardColumnId[] = ['pending', 'in-progress', 'review', 'approved', 'deployed'];
const AI_COLUMNS: BoardColumnId[] = ['review', 'audio', 'approved', 'deployed'];

/**
 * The columns of one language's board, in order. `statuses` has one entry per
 * document on it, empty for a document with no version yet.
 *
 * An AI board still has to show every document, so the two columns it leaves
 * out come back for as long as something sits in them. "Not Started" holds a
 * document uploaded before the language switched, which waits for its manager
 * to hand it to the AI. "In Progress" holds a version a translator started in
 * the manual workflow, which stays there after the switch.
 */
export function boardColumns(
  languageWorkflow: TranslationWorkflow | null | undefined,
  statuses: (DocumentStatus | null | undefined)[],
): BoardColumnId[] {
  if (languageWorkflow !== TranslationWorkflow.AI) return MANUAL_COLUMNS;
  const waiting = statuses.some((status) => !status || status === DocumentStatus.PENDING_TRANSLATION);
  const translating = statuses.includes(DocumentStatus.IN_PROGRESS);
  return [...(waiting ? (['pending'] as const) : []), ...(translating ? (['in-progress'] as const) : []), ...AI_COLUMNS];
}

/**
 * The column a version sits in. On a manual board the AI workflow's own steps
 * fold into the column they stand in for. On an AI board the AI's draft sits
 * in "In Review", where it lands minutes later, tagged as the AI's work until
 * then, and the AI preparing the audio text shares a column with the check
 * that follows it.
 */
export function boardColumnFor(
  status: DocumentStatus | null | undefined,
  languageWorkflow: TranslationWorkflow | null | undefined,
): BoardColumnId {
  if (!status) return 'pending';
  if (languageWorkflow === TranslationWorkflow.AI) {
    if (status === DocumentStatus.AI_TRANSLATING) return 'review';
    if (status === DocumentStatus.AI_PREPARING_AUDIO || status === DocumentStatus.AUDIO_REVIEW) return 'audio';
  }
  switch (boardStatus(status)) {
    case DocumentStatus.IN_PROGRESS:
      return 'in-progress';
    case DocumentStatus.PENDING_REVIEW:
      return 'review';
    case DocumentStatus.APPROVED:
      return 'approved';
    case DocumentStatus.DEPLOYED:
      return 'deployed';
    default:
      return 'pending';
  }
}
