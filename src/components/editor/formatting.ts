/**
 * What a formatting button does to a piece of text, and which buttons a
 * selection already has on.
 *
 * Kept as text in, text out, so the same behaviour serves both editors -- the
 * translation pane and the source pane edit the same way -- and so it can be
 * tested without an editor. The caller turns the result into an editor
 * transaction.
 */

export type FormattingAction =
  | 'bold'
  | 'italic'
  | 'strikethrough'
  | 'link'
  | 'heading1'
  | 'heading2'
  | 'heading3'
  | 'bulletList'
  | 'numberedList'
  | 'quote'
  | 'lineBreak'
  | 'clear';

export interface FormattingEdit {
  from: number;
  to: number;
  insert: string;
}

export interface FormattingResult {
  changes: FormattingEdit[];
  selection: { anchor: number; head: number };
}

/**
 * A bold, italic, struck or linked span around a selection or inside it, as
 * the editor's Markdown parser reads it (see cm-inline-spans).
 *
 * The markers beside a selection cannot say whether it is bold. A word in the
 * middle of `**a discipline you commit to**` has none next to it, and in
 * `**a** b **c**` the `**` on each side of `b` close and open two other spans:
 * it is the parser that knows which marker closes which.
 */
export interface InlineSpan {
  action: 'bold' | 'italic' | 'strikethrough' | 'link';
  /** The whole span, markers included. */
  from: number;
  to: number;
  /** Its text: between the markers, or between a link's brackets. */
  textFrom: number;
  textTo: number;
}

/** The inline actions that wrap a selection in a marker on each side. */
const WRAPS: Partial<Record<FormattingAction, string>> = {
  bold: '**',
  italic: '*',
  strikethrough: '~~',
};

/** Put between the parentheses of a new link, and left selected. */
const LINK_PLACEHOLDER = 'url';

const HEADING_LEVELS: Partial<Record<FormattingAction, number>> = {
  heading1: 1,
  heading2: 2,
  heading3: 3,
};

/** Prefixes a line-oriented action toggles, and how it reads them back. */
const LINE_PREFIXES: Partial<Record<FormattingAction, RegExp>> = {
  bulletList: /^\s*(?:[*+-])\s+/,
  numberedList: /^\s*\d+\.\s+/,
  quote: /^\s*>\s?/,
};

/**
 * Any block marker a line may already carry -- a heading, a quote, a bullet, a
 * number. Every line-oriented action strips whatever is there before writing
 * its own, so switching a list from bullets to numbers does not leave `-` in.
 */
const ANY_BLOCK_PREFIX = /^\s*(?:#{1,6}\s+|>\s?|[*+-]\s+|\d+\.\s+)/;
const INLINE_MARKERS = /\*\*|__|~~|`|\*|_/g;
/**
 * `~x~`: one tilde each side, which the preview strikes through as it does
 * `~~x~~`. Only as a pair -- a lone tilde is prose ("~5 minutes"), and taking
 * it out would change what the text says.
 */
const SINGLE_TILDE_PAIR = /(?<!~)~(?=[^\s~])([^~]*?[^\s~])~(?!~)/g;

/**
 * The inline markers stripped out of a selection.
 *
 * An underscore inside a word is not a marker: `sort_order` and `snake_case`
 * are keys this library is full of, and CommonMark does not read an intraword
 * `_` as emphasis either, so a selected key keeps its name.
 */
function stripInlineMarkers(selected: string): string {
  const unstruck = selected.replace(SINGLE_TILDE_PAIR, '$1');
  return unstruck.replace(INLINE_MARKERS, (marker, offset: number) => {
    if (marker[0] !== '_') return '';
    const isWord = (character: string | undefined) => !!character && /\w/.test(character);
    return isWord(unstruck[offset - 1]) && isWord(unstruck[offset + marker.length]) ? marker : '';
  });
}

function lineRange(text: string, from: number, to: number): { start: number; end: number } {
  const start = text.lastIndexOf('\n', from - 1) + 1;
  const nextBreak = text.indexOf('\n', to);
  return { start, end: nextBreak === -1 ? text.length : nextBreak };
}

/**
 * Applies `edit` to each selected line, returning one change per line. Blank
 * lines are skipped -- a selection that ends at a line break includes the
 * empty line after it, and prefixing that would leave a stray marker behind.
 * The index counts the lines that were edited, so a numbered list numbers the
 * items rather than the gaps between them.
 */
function perLine(
  text: string,
  from: number,
  to: number,
  edit: (line: string, index: number) => string | null,
): FormattingResult {
  const { start, end } = lineRange(text, from, to);
  const changes: FormattingEdit[] = [];
  let offset = start;
  let index = 0;
  let delta = 0;

  for (const line of text.slice(start, end).split('\n')) {
    const lineEnd = offset + line.length;
    if (line.length > 0) {
      const next = edit(line, index);
      if (next !== null && next !== line) {
        changes.push({ from: offset, to: lineEnd, insert: next });
        delta += next.length - line.length;
      }
      index += 1;
    }
    offset = lineEnd + 1;
  }

  // `start` and `end` are offsets in the document as it is now, and a
  // dispatched selection is read in the one these changes leave behind: every
  // line that grew or shrank moves the end of the block. Without the delta,
  // taking a marker off the last lines of a document put `head` past the last
  // character, CodeMirror rejected the whole transaction, and the button did
  // nothing at all -- and anywhere else the selection quietly spilled into the
  // line below, so the next click reformatted text nobody had selected.
  return { changes, selection: { anchor: start, head: end + delta } };
}

/** The selected lines that have something on them. */
function contentLines(text: string, from: number, to: number): string[] {
  const { start, end } = lineRange(text, from, to);
  return text
    .slice(start, end)
    .split('\n')
    .filter((line) => line.length > 0);
}

/**
 * Whether every selected line already reads as this block. A selection with
 * nothing on it is not a heading or a list of anything, so it is never "on".
 */
function everyLine(text: string, from: number, to: number, test: (line: string) => boolean): boolean {
  const lines = contentLines(text, from, to);
  return lines.length > 0 && lines.every(test);
}

const headingPrefix = (level: number) => `${'#'.repeat(level)} `;

/** The index of the `)` closing the parenthesis at `open`, on the same line; -1 if none. */
function closingParen(text: string, open: number): number {
  let depth = 0;
  for (let index = open; index < text.length; index += 1) {
    const character = text[index];
    if (character === '\n') return -1;
    if (character === '(') depth += 1;
    if (character === ')') {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

interface LinkSpan {
  /** The whole `[text](url)`. */
  from: number;
  to: number;
  /** The text between the brackets. */
  label: string;
}

/**
 * The inline link a selection is, or is the text of: `[text](url)` selected
 * whole, or its `text` selected. Without this the link button could only ever
 * add, and on a link it nested a second one inside the first.
 *
 * An image is not a link here -- `![alt](src)` has the same brackets, and
 * taking them off would leave its `!` stranded in the prose.
 */
function linkAround(text: string, from: number, to: number): LinkSpan | null {
  const selected = text.slice(from, to);

  // The text was selected: `[` just before it, `](` just after.
  if (
    selected.length > 0 &&
    !/[[\]]/.test(selected) &&
    text[from - 1] === '[' &&
    text[from - 2] !== '!' &&
    text.startsWith('](', to)
  ) {
    const end = closingParen(text, to + 1);
    if (end !== -1) return { from: from - 1, to: end + 1, label: selected };
  }

  // The whole link was selected, brackets and all.
  if (selected.startsWith('[') && text[from - 1] !== '!') {
    const close = selected.indexOf('](');
    const label = close === -1 ? '' : selected.slice(1, close);
    if (close !== -1 && !/[[\]]/.test(label) && closingParen(text, from + close + 1) === to - 1) {
      return { from, to, label };
    }
  }

  return null;
}

/**
 * The span of this kind that a selection sits inside, or is, markers and all.
 *
 * Asked of the parser rather than read from the markers at the selection's
 * ends: `*it* and **Bold**` selected whole starts and ends with asterisks, and
 * is neither italic nor bold -- the `*` and the `**` close two other spans,
 * and so do the two `**` of `**Start** middle **end**`. Taking a marker off
 * each end of those broke both spans and removed no formatting at all.
 */
function spanAround(
  text: string,
  spans: readonly InlineSpan[],
  action: FormattingAction,
  from: number,
  to: number,
): InlineSpan | undefined {
  // A caret is not "in" a span a click could split.
  if (from === to) return undefined;
  return spans.find(
    (span) =>
      span.action === action && ((span.textFrom <= from && to <= span.textTo) || isSpanSelected(text, span, from, to)),
  );
}

/**
 * Whether the selection is the span, markers and all. It may reach past them
 * into the markers of a span around this one: `***grace***` selected whole is
 * bold as much as it is italic, and its bold is the inner `**` pair.
 */
function isSpanSelected(text: string, span: InlineSpan, from: number, to: number): boolean {
  if (span.from < from || to < span.to) return false;
  const marker = text[span.from];
  const onlyMarkers = (part: string) => [...part].every((character) => character === marker);
  return (
    (span.from === from && span.to === to) ||
    (span.action !== 'link' && onlyMarkers(text.slice(from, span.from)) && onlyMarkers(text.slice(span.to, to)))
  );
}

/**
 * `text` between `from` and `to`, with these spans' markers taken out: the
 * spans of a kind already inside a selection, before one pair of that kind
 * goes round the whole.
 */
function withoutMarkers(text: string, from: number, to: number, spans: readonly InlineSpan[]): string {
  const cuts = spans
    .flatMap((span) => [
      [span.from, span.textFrom],
      [span.textTo, span.to],
    ])
    .sort((a, b) => a[0] - b[0]);
  let words = '';
  let at = from;
  for (const [cutFrom, cutTo] of cuts) {
    words += text.slice(at, cutFrom);
    at = cutTo;
  }
  return words + text.slice(at, to);
}

/** The part of a selection that is a span's text, without its markers. */
const wordsOf = (span: InlineSpan, from: number, to: number) => ({
  from: Math.max(from, span.textFrom),
  to: Math.min(to, span.textTo),
});

const isSpace = (character: string | undefined) => character === undefined || /\s/.test(character);
const isPunctuation = (character: string | undefined) => !!character && /[\p{P}\p{S}]/u.test(character);
const hasWords = (text: string) => /[^\s\p{P}\p{S}]/u.test(text);

/**
 * Whether a marker written at `at` would open (or close) emphasis, by
 * CommonMark's flanking rules.
 *
 * A marker that does not flank the right way is literal text: `b**, c**`
 * does not reopen bold before "c", because the `**` sits between a word and a
 * comma. A marker written beside another of the same character joins its run,
 * so the neighbours that count are the ones outside the run.
 */
function markerWorks(text: string, at: number, character: string, opens: boolean): boolean {
  let start = at;
  while (text[start - 1] === character) start -= 1;
  let end = at;
  while (text[end] === character) end += 1;
  const before = text[start - 1];
  const after = text[end];

  const left = !isSpace(after) && (!isPunctuation(after) || isSpace(before) || isPunctuation(before));
  const right = !isSpace(before) && (!isPunctuation(before) || isSpace(after) || isPunctuation(after));
  // An underscore between two letters is part of a word (`snake_case`), not
  // emphasis.
  if (character === '_')
    return opens ? left && (!right || isPunctuation(before)) : right && (!left || isPunctuation(after));
  return opens ? left : right;
}

/**
 * Takes a wrap off just the selected words of a longer span, as a word
 * processor would: `**a discipline you commit to**` with "discipline"
 * selected becomes `**a** discipline **you commit to**`. The span is closed
 * before the selection and opened again after it, each at the nearest place
 * the parser reads a marker as one; a side with no words left loses its
 * marker instead.
 */
function splitSpan(text: string, from: number, to: number, span: InlineSpan): FormattingResult {
  const marker = text.slice(span.from, span.textFrom);
  const character = marker[0];
  const changes: FormattingEdit[] = [];
  let shift = 0;

  let close = from;
  while (close > span.textFrom && !markerWorks(text, close, character, false)) close -= 1;
  if (hasWords(text.slice(span.textFrom, close))) {
    changes.push({ from: close, to: close, insert: marker });
    shift = marker.length;
  } else {
    changes.push({ from: span.from, to: span.textFrom, insert: '' });
    shift = -marker.length;
  }

  let open = to;
  while (open < span.textTo && !markerWorks(text, open, character, true)) open += 1;
  if (hasWords(text.slice(open, span.textTo))) {
    changes.push({ from: open, to: open, insert: marker });
  } else {
    changes.push({ from: span.textTo, to: span.to, insert: '' });
  }

  return { changes, selection: { anchor: from + shift, head: to + shift } };
}

/**
 * The buttons a selection already has on -- the ones that would take their
 * formatting off rather than put it on.
 *
 * Read with the same tests the actions toggle on, so a button shown as on is
 * exactly a button whose click removes it: the two cannot disagree about what
 * the selection is. The line break and "remove formatting" are commands, not
 * states, and are never on.
 */
export function activeFormattingActions(
  text: string,
  selection: { from: number; to: number },
  spans: readonly InlineSpan[],
): FormattingAction[] {
  const { from, to } = selection;
  const active: FormattingAction[] = [];

  for (const action of Object.keys(WRAPS) as FormattingAction[]) {
    if (spanAround(text, spans, action, from, to)) active.push(action);
  }
  if (linkAround(text, from, to) || spanAround(text, spans, 'link', from, to)) active.push('link');
  for (const [action, level] of Object.entries(HEADING_LEVELS) as [FormattingAction, number][]) {
    const want = headingPrefix(level);
    if (everyLine(text, from, to, (line) => line.trimStart().startsWith(want))) active.push(action);
  }
  for (const [action, pattern] of Object.entries(LINE_PREFIXES) as [FormattingAction, RegExp][]) {
    if (everyLine(text, from, to, (line) => pattern.test(line))) active.push(action);
  }

  return active;
}

export function applyFormattingAction(
  text: string,
  selection: { from: number; to: number },
  action: FormattingAction,
  spans: readonly InlineSpan[],
): FormattingResult | null {
  const { from, to } = selection;
  const selected = text.slice(from, to);

  if (action === 'lineBreak') {
    return { changes: [{ from: to, to, insert: '<br>' }], selection: { anchor: to + 4, head: to + 4 } };
  }

  if (action === 'clear') {
    const cleaned = stripInlineMarkers(selected);
    return { changes: [{ from, to, insert: cleaned }], selection: { anchor: from, head: from + cleaned.length } };
  }

  const level = HEADING_LEVELS[action];
  if (level) {
    const want = headingPrefix(level);
    const alreadyAtLevel = everyLine(text, from, to, (line) => line.trimStart().startsWith(want));
    return perLine(text, from, to, (line) => {
      const bare = line.replace(ANY_BLOCK_PREFIX, '');
      return alreadyAtLevel ? bare : want + bare;
    });
  }

  const prefixPattern = LINE_PREFIXES[action];
  if (prefixPattern) {
    const already = everyLine(text, from, to, (line) => prefixPattern.test(line));
    return perLine(text, from, to, (line, index) => {
      if (already) return line.replace(prefixPattern, '');
      const bare = line.replace(ANY_BLOCK_PREFIX, '');
      if (action === 'numberedList') return `${index + 1}. ${bare}`;
      if (action === 'bulletList') return `* ${bare}`;
      return `> ${bare}`;
    });
  }

  if (action === 'link') {
    const link = linkAround(text, from, to);
    if (link) {
      // Already a link: take the brackets and the destination off, and keep
      // the words selected.
      return {
        changes: [{ from: link.from, to: link.to, insert: link.label }],
        selection: { anchor: link.from, head: link.from + link.label.length },
      };
    }
    // Some of a link's words: a link cannot be split, so it comes off whole
    // and the words that were selected stay selected.
    const span = spanAround(text, spans, action, from, to);
    if (span) {
      const opening = span.textFrom - span.from;
      const words = wordsOf(span, from, to);
      return {
        changes: [
          { from: span.from, to: span.textFrom, insert: '' },
          { from: span.textTo, to: span.to, insert: '' },
        ],
        selection: { anchor: words.from - opening, head: words.to - opening },
      };
    }
    // A link wraps the selection as its text and leaves the destination
    // selected, because that is the part nobody has yet.
    const label = selected || 'text';
    const insert = `[${label}](${LINK_PLACEHOLDER})`;
    const urlFrom = from + label.length + 3;
    return {
      changes: [{ from, to, insert }],
      selection: { anchor: urlFrom, head: urlFrom + LINK_PLACEHOLDER.length },
    };
  }

  const marker = WRAPS[action];
  if (!marker) return null;

  const span = spanAround(text, spans, action, from, to);
  if (span) {
    const words = wordsOf(span, from, to);
    return splitSpan(text, words.from, words.to, span);
  }

  // Nothing selected: insert the pair and sit between the markers.
  if (selected.length === 0) {
    return {
      changes: [{ from, to, insert: marker + marker }],
      selection: { anchor: from + marker.length, head: from + marker.length },
    };
  }

  // Some of the selection may carry this already -- `*it* and **Bold**` made
  // bold. Those markers come off and one pair goes round the whole: a pair
  // written round the others reads as neither in the preview.
  const inside = spans.filter((span) => span.action === action && from <= span.from && span.to <= to);
  const words = withoutMarkers(text, from, to, inside);
  return {
    changes: [{ from, to, insert: marker + words + marker }],
    selection: { anchor: from + marker.length, head: from + marker.length + words.length },
  };
}
