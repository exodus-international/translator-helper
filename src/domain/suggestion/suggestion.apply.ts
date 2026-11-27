import { SuggestionStatus, SuggestionType } from '@/generated/prisma/enums';
import { refuse, type Refusal } from '@/lib/action-refusal';
import { applyTextEditAtRange, extractTextAtRange, occurrencesOf, offsetsToRange, rangeToOffsets } from '@/lib/text-range';

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

/**
 * The suggestion proposes the text that is already in its range, which is what
 * a change saved with the new wording in its comment looks like. Applying it
 * would report a change that never happened.
 */
export class SuggestionChangesNothingError extends Error {
  constructor() {
    super('This suggestion proposes the text that is already there. Edit its proposed replacement, then apply it.');
    this.name = 'SuggestionChangesNothingError';
  }
}

/**
 * The words the suggestion was made on are no longer where it points, and are
 * not anywhere else exactly once: someone rewrote them.
 */
export class SuggestionTextChangedError extends Error {
  constructor() {
    super('The text this suggestion was made on has changed since. Dismiss it, or make a new suggestion on the text as it is now.');
    this.name = 'SuggestionTextChangedError';
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
  /** The words selected when the suggestion was made. Null on suggestions older than the column. */
  anchorText?: string | null;
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
  /** Where the change was made: the stored range, or where its words were found. */
  range: TextRange;
  /** What the range holds once the change is in, so a reopen can put the old text back. */
  appliedRange: TextRange;
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

  const stored = {
    startLine: suggestion.startLine,
    startColumn: suggestion.startColumn,
    endLine: suggestion.endLine,
    endColumn: suggestion.endColumn,
  };
  const range = locateSuggestedText(stored, suggestion.anchorText, content);

  const originalText = extractTextAtRange(content, range);
  if (originalText === suggestion.proposedText) {
    throw new SuggestionChangesNothingError();
  }

  const newContent = applyTextEditAtRange(content, range, suggestion.proposedText);
  const start = rangeToOffsets(content, range)!.start;
  return {
    range,
    appliedRange: offsetsToRange(newContent, start, start + suggestion.proposedText.length),
    originalText,
    newContent,
  };
}

/**
 * The range to change. The stored one when it still holds the words the
 * suggestion was made on. Saving the text moves stored ranges along with it,
 * so a miss means those words were edited: they are then used only where they
 * appear exactly once. A suggestion with no record of its words is taken at
 * its stored range, as long as that range exists.
 */
function locateSuggestedText(stored: TextRange, anchorText: string | null | undefined, content: string): TextRange {
  const offsets = rangeToOffsets(content, stored);
  if (anchorText == null) {
    if (!offsets) throw new Error('Suggestion range is out of bounds');
    return stored;
  }
  if (offsets && content.slice(offsets.start, offsets.end) === anchorText) return stored;
  const found = occurrencesOf(content, anchorText);
  if (found.length !== 1) throw new SuggestionTextChangedError();
  return offsetsToRange(content, found[0], found[0] + anchorText.length);
}

export interface ApplySuggestionDeps<Version> {
  updateVersion: (versionId: string, content: string, userId: string) => Promise<Version>;
  markApplied: (suggestionId: string, originalText: string, appliedRange: TextRange) => Promise<unknown>;
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
   * dismissed, that proposes the text already there, or whose words were
   * rewritten, is refused.
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
      if (error instanceof SuggestionChangesNothingError || error instanceof SuggestionTextChangedError) {
        return refuse(error.message);
      }
      throw error;
    }

    const version = await deps.updateVersion(versionId, plan.newContent, actorId);
    await deps.markApplied(suggestion.id, plan.originalText, plan.appliedRange);
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
