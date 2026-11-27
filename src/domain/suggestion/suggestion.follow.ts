import { SuggestionStatus } from '@/generated/prisma/enums';
import { followEdit } from '@/lib/text-range';

/**
 * Keeping suggestions on their words while the text is edited.
 *
 * A suggestion points at its text by line and column. Every save of the
 * version's text moves those numbers along with the edit, so the highlight,
 * the preview on the thread card and applying all still mean the words the
 * suggestion was made on.
 */

export interface PlacedSuggestion {
  id: string;
  status: SuggestionStatus;
  startLine: number | null;
  startColumn: number | null;
  endLine: number | null;
  endColumn: number | null;
  anchorText: string | null;
  proposedText: string | null;
}

export interface MovedSuggestion {
  id: string;
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
}

/** The suggestions whose range is somewhere else once `before` has become `after`. */
export function followContentChange(before: string, after: string, suggestions: PlacedSuggestion[]): MovedSuggestion[] {
  if (before === after) return [];
  const moved: MovedSuggestion[] = [];
  for (const suggestion of suggestions) {
    const { startLine, startColumn, endLine, endColumn } = suggestion;
    if (startLine == null || startColumn == null || endLine == null || endColumn == null) continue;
    const range = { startLine, startColumn, endLine, endColumn };
    // An applied change holds its proposed text; anything else, the words it was made on.
    const holds = suggestion.status === SuggestionStatus.APPLIED ? suggestion.proposedText : suggestion.anchorText;
    const next = followEdit(before, after, range, holds);
    if (!next) continue;
    if (
      next.startLine !== startLine ||
      next.startColumn !== startColumn ||
      next.endLine !== endLine ||
      next.endColumn !== endColumn
    ) {
      moved.push({ id: suggestion.id, ...next });
    }
  }
  return moved;
}
