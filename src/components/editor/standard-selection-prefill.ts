import { stripLayout, type LayoutPart } from '@/domain/standard-translation/match-form';

/** What the add dialog starts from when a translator picks out source text. */
export interface StandardPrefill {
  /** The selected source text, wording only. */
  sourceText: string;
  /** The translation's lines the selection covers, wording only; empty when it has none of them. */
  targetText: string;
  /** What `stripLayout` took out of either text, each part once. */
  removed: LayoutPart[];
  /** Which translation lines the target came from, for the translator to check; null when none. */
  hint: string | null;
}

// Plain scans rather than regexes: a repeated group around a run of `*` or `_`
// backtracks exponentially on a fill-in blank like `Name: ______ Date:`.
const isSpace = (char: string | undefined) => char === ' ' || char === '\t' || char === '\n' || char === '\r';
const isEmphasis = (char: string | undefined) => char === '*' || char === '_' || char === '~';
const isDigit = (char: string | undefined) => char !== undefined && char >= '0' && char <= '9';

/** Whether the text is only layout that can stand before the wording on a line: indentation, quote, list and heading markers, emphasis. */
function onlyLeadingLayout(text: string): boolean {
  let i = 0;
  while (i < text.length) {
    const char = text[i];
    if (isSpace(char) || char === '>' || isEmphasis(char)) {
      i++;
    } else if ((char === '-' || char === '+') && isSpace(text[i + 1])) {
      i += 2;
    } else if (isDigit(char)) {
      while (isDigit(text[i])) i++;
      if ((text[i] !== '.' && text[i] !== ')') || !isSpace(text[i + 1])) return false;
      i += 2;
    } else if (char === '#') {
      const start = i;
      while (text[i] === '#' && i - start < 6) i++;
      if (!isSpace(text[i])) return false;
      i++;
    } else {
      return false;
    }
  }
  return true;
}

/** Whether the text is only layout that can follow the wording on a line: closing emphasis and comments such as the pause marker. */
function onlyTrailingLayout(text: string): boolean {
  let i = 0;
  while (i < text.length) {
    if (isSpace(text[i]) || isEmphasis(text[i])) {
      i++;
    } else if (text.startsWith('<!--', i)) {
      const close = text.indexOf('-->', i + 4);
      if (close === -1) return false;
      i = close + 3;
    } else {
      return false;
    }
  }
  return true;
}

/**
 * The add dialog's starting texts for a selection of `source` from `from` to
 * `to`, with `translation` beside it.
 *
 * A translation is written line for line against its source (`align-lines`),
 * so the translation of the selected text is on the same lines: those lines,
 * whole, are taken as the standard translation, and the hint names them so
 * the translator checks the guess before saving it.
 *
 * A selection usually stops at the wording, short of the markers around it --
 * `> *` before the first line, `*` and a pause marker after the last. Left in,
 * half of a pair of markers is no longer layout `stripLayout` knows, and would
 * be saved as text; so a selection that has only layout between it and the
 * edge of its line is taken to that edge first.
 */
export function standardPrefill({
  source,
  from,
  to,
  translation,
}: {
  source: string;
  from: number;
  to: number;
  translation: string;
}): StandardPrefill {
  const lineStart = source.lastIndexOf('\n', from - 1) + 1;
  const lineEndAt = source.indexOf('\n', to);
  const lineEnd = lineEndAt === -1 ? source.length : lineEndAt;
  const start = onlyLeadingLayout(source.slice(lineStart, from)) ? lineStart : from;
  const end = onlyTrailingLayout(source.slice(to, lineEnd)) ? lineEnd : to;
  const sourceStripped = stripLayout(source.slice(start, end));

  // A selection that ends at the start of a line, as a drag over whole lines
  // does, does not take that line in.
  const firstLine = lineOf(source, from);
  const lastLine = Math.max(
    firstLine,
    to > from && source[to - 1] === '\n' ? lineOf(source, to) - 1 : lineOf(source, to),
  );

  const translationLines = translation.split('\n');
  const takenTo = Math.min(lastLine, translationLines.length);
  const targetStripped = stripLayout(translationLines.slice(firstLine - 1, takenTo).join('\n'));
  const taken = targetStripped.text.trim() !== '';

  return {
    sourceText: sourceStripped.text,
    targetText: targetStripped.text,
    removed: [...new Set([...sourceStripped.removed, ...targetStripped.removed])],
    hint: taken ? `Taken from ${lineSpan(firstLine, takenTo)} of the translation. Check it before saving.` : null,
  };
}

/** The 1-based line `offset` is on. */
function lineOf(text: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset; i++) if (text[i] === '\n') line++;
  return line;
}

function lineSpan(first: number, last: number): string {
  return first === last ? `line ${first}` : `lines ${first}–${last}`;
}
