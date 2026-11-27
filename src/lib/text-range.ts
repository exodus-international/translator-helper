/**
 * Pure utilities for line/column-based text edits within a document.
 * Coordinates are 1-based, as stored on a suggestion — converted to 0-based internally.
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

// Convert 1-based coordinates to 0-based array indices
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

/** The range as character offsets into `content`, or null when it points past a line or the text. */
export function rangeToOffsets(content: string, range: TextRange): { start: number; end: number } | null {
  const lines = content.split('\n');
  const offsetOf = (line: number, column: number) => {
    if (line < 1 || line > lines.length || column < 1 || column - 1 > lines[line - 1].length) return null;
    let offset = column - 1;
    for (let i = 0; i < line - 1; i++) offset += lines[i].length + 1;
    return offset;
  };
  const start = offsetOf(range.startLine, range.startColumn);
  const end = offsetOf(range.endLine, range.endColumn);
  return start == null || end == null || end < start ? null : { start, end };
}

/** Character offsets into `content` as a 1-based line and column range. */
export function offsetsToRange(content: string, start: number, end: number): TextRange {
  const position = (offset: number) => {
    const before = content.slice(0, offset);
    const lastBreak = before.lastIndexOf('\n');
    return { line: before.split('\n').length, column: offset - lastBreak };
  };
  const from = position(start);
  const to = position(end);
  return { startLine: from.line, startColumn: from.column, endLine: to.line, endColumn: to.column };
}

/** Every offset at which `text` occurs in `content`. */
export function occurrencesOf(content: string, text: string): number[] {
  const found: number[] = [];
  if (!text) return found;
  for (let at = content.indexOf(text); at !== -1; at = content.indexOf(text, at + 1)) found.push(at);
  return found;
}

/**
 * Where a range is after `before` became `after`, so a suggestion stays on the
 * words it was made on while the text around them is edited.
 *
 * The edit is taken as one changed region, the part between the longest common
 * start and end of the two texts. A range before the region stays, one after it
 * moves by the change in length, and one that holds the whole region grows or
 * shrinks with it. When the region only partly covers the range, or covers it
 * whole, `expectedText` (the words the range should hold) is looked for in the
 * new text and the occurrence nearest the old place is taken. Null when the
 * range cannot be placed: the caller leaves it as it was.
 */
export function followEdit(before: string, after: string, range: TextRange, expectedText?: string | null): TextRange | null {
  if (before === after) return range;
  const offsets = rangeToOffsets(before, range);
  if (!offsets) return null;
  const { start, end } = offsets;

  const shortest = Math.min(before.length, after.length);
  let prefix = 0;
  while (prefix < shortest && before[prefix] === after[prefix]) prefix++;
  let suffix = 0;
  while (suffix < shortest - prefix && before[before.length - 1 - suffix] === after[after.length - 1 - suffix]) suffix++;
  const changedFrom = prefix;
  const changedTo = before.length - suffix;
  const delta = after.length - before.length;

  if (changedFrom >= end) return range;
  if (changedTo <= start) return offsetsToRange(after, start + delta, end + delta);
  const insideRange = changedFrom >= start && changedTo <= end;
  const coversRange = changedFrom <= start && changedTo >= end;
  if (insideRange && !coversRange) return offsetsToRange(after, start, end + delta);

  if (!expectedText) return null;
  const candidates = occurrencesOf(after, expectedText);
  if (candidates.length === 0) return null;
  const nearest = candidates.reduce((best, at) => (Math.abs(at - start) < Math.abs(best - start) ? at : best));
  const tied = candidates.filter((at) => Math.abs(at - start) === Math.abs(nearest - start)).length > 1;
  return tied ? null : offsetsToRange(after, nearest, nearest + expectedText.length);
}
