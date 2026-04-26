/**
 * Pure utilities for line/column-based text edits within a document.
 * Coordinates are 1-based (Monaco convention) — converted to 0-based internally.
 *
 * Used by both:
 *  - The diff preview UI (applies suggestions to show what they'd produce)
 *  - The apply-suggestion server action (writes the result to the DB)
 *
 * Keeping a single implementation prevents the two from drifting apart.
 */

interface TextRange {
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
}

// Convert 1-based Monaco coordinates to 0-based array indices
function toZeroBased(range: TextRange) {
  return {
    startLine: range.startLine - 1,
    endLine: range.endLine - 1,
    startColumn: range.startColumn - 1,
    endColumn: range.endColumn - 1,
  };
}

/**
 * Replace the text in `content` between `range.start` and `range.end` with `replacement`.
 * Returns the new content. Caller is responsible for bounds-checking the range.
 */
export function applyTextEditAtRange(content: string, range: TextRange, replacement: string): string {
  const lines = content.split('\n');
  const { startLine, endLine, startColumn, endColumn } = toZeroBased(range);

  if (startLine === endLine) {
    const line = lines[startLine];
    lines[startLine] = line.substring(0, startColumn) + replacement + line.substring(endColumn);
  } else {
    const firstLine = lines[startLine];
    const lastLine = lines[endLine];
    const before = firstLine.substring(0, startColumn);
    const after = lastLine.substring(endColumn);
    lines.splice(startLine, endLine - startLine + 1, before + replacement + after);
  }
  return lines.join('\n');
}

/**
 * Extract the text in `content` between `range.start` and `range.end`.
 */
export function extractTextAtRange(content: string, range: TextRange): string {
  const lines = content.split('\n');
  const { startLine, endLine, startColumn, endColumn } = toZeroBased(range);

  if (startLine === endLine) {
    return lines[startLine].substring(startColumn, endColumn);
  }
  const firstLine = lines[startLine].substring(startColumn);
  const lastLine = lines[endLine].substring(0, endColumn);
  const middleLines = lines.slice(startLine + 1, endLine);
  return [firstLine, ...middleLines, lastLine].join('\n');
}

/**
 * Check whether the (0-based) startLine/endLine of `range` are within `lineCount`.
 */
export function isRangeWithinBounds(range: TextRange, lineCount: number): boolean {
  return range.startLine - 1 >= 0 && range.endLine - 1 < lineCount;
}
