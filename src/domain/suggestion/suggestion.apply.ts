import { SuggestionStatus, SuggestionType } from '@/generated/prisma/enums';
import { refuse, type Refusal } from '@/lib/action-refusal';
import { applyTextEditAtRange, extractTextAtRange, isRangeWithinBounds } from '@/lib/text-range';

/**
 * Applying a suggestion: replacing the text it points at with the text it
 * proposes, apart from who may do it.
 *
 * The server action checks the caller; `planSuggestionApplication` decides
 * whether the suggestion can be applied to the text as it is now and what the
 * result is, and `createApplySuggestion(deps)` writes that result.
 */

/**
 * The suggestion was applied or dismissed after the page loaded, by someone
 * else or by an earlier try of the same request.
 */
export class SuggestionNotOpenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SuggestionNotOpenError';
  }
}

/** What the suggestion actions return when the suggestion is no longer open. */
export function refuseClosedSuggestion(): Refusal {
  return refuse('This suggestion is no longer open. The list now shows its current state.');
}

export interface ApplicableSuggestion {
  id: string;
  status: SuggestionStatus;
  type: SuggestionType;
  proposedText: string | null;
  startLine: number | null;
  startColumn: number | null;
  endLine: number | null;
  endColumn: number | null;
}

export interface TextRange {
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
}

export interface SuggestionApplication {
  range: TextRange;
  /** What the range held before, kept so the change can be reverted. */
  originalText: string;
  newContent: string;
}

/** Throws, with the reason, when the suggestion cannot be applied to `content`. */
export function planSuggestionApplication(suggestion: ApplicableSuggestion, content: string): SuggestionApplication {
  if (suggestion.status !== SuggestionStatus.OPEN) {
    throw new SuggestionNotOpenError('Only open suggestions can be applied');
  }
  if (suggestion.type !== SuggestionType.CHANGE) {
    throw new Error('Only CHANGE type suggestions can be applied');
  }
  if (!suggestion.proposedText) {
    throw new Error('Suggestion does not have proposed text');
  }
  if (
    suggestion.startLine == null ||
    suggestion.endLine == null ||
    suggestion.startColumn == null ||
    suggestion.endColumn == null
  ) {
    throw new Error('Cannot apply a suggestion without a text range');
  }

  const range = {
    startLine: suggestion.startLine,
    startColumn: suggestion.startColumn,
    endLine: suggestion.endLine,
    endColumn: suggestion.endColumn,
  };
  if (!isRangeWithinBounds(range, content.split('\n').length)) {
    throw new Error('Suggestion range is out of bounds');
  }

  return {
    range,
    originalText: extractTextAtRange(content, range),
    newContent: applyTextEditAtRange(content, range, suggestion.proposedText),
  };
}

export interface ApplySuggestionDeps<Version> {
  updateVersion: (versionId: string, content: string, userId: string) => Promise<Version>;
  markApplied: (suggestionId: string, originalText: string) => Promise<unknown>;
  log: (entry: {
    documentVersionId: string;
    userId: string;
    action: 'applied_suggestion';
    details: Record<string, unknown>;
  }) => Promise<unknown>;
  /** Drops the cached document page, once the text on it has changed. */
  revalidateDocumentPage: () => void;
}

export function createApplySuggestion<Version>(deps: ApplySuggestionDeps<Version>) {
  /**
   * Applying a suggestion that is already applied writes nothing and returns
   * the version as it is, so a retried request succeeds. One that was
   * dismissed is refused.
   */
  return async function applySuggestion(input: {
    suggestion: ApplicableSuggestion;
    versionId: string;
    content: string;
    /** The version as stored now, returned when there is nothing to do. */
    currentVersion: Version;
    actorId: string;
  }): Promise<Version | Refusal> {
    const { suggestion, versionId, content, currentVersion, actorId } = input;
    if (suggestion.status === SuggestionStatus.APPLIED) {
      return currentVersion;
    }

    let plan: SuggestionApplication;
    try {
      plan = planSuggestionApplication(suggestion, content);
    } catch (error) {
      if (error instanceof SuggestionNotOpenError) return refuseClosedSuggestion();
      throw error;
    }

    const version = await deps.updateVersion(versionId, plan.newContent, actorId);
    await deps.markApplied(suggestion.id, plan.originalText);
    await deps.log({
      documentVersionId: versionId,
      userId: actorId,
      action: 'applied_suggestion',
      details: { suggestionId: suggestion.id, type: suggestion.type, range: plan.range },
    });
    deps.revalidateDocumentPage();
    return version;
  };
}
