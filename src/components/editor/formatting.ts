/**
 * What a formatting button does to a piece of text.
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

interface Wrap {
  marker: string;
  /** Placeholder inserted between the parentheses, for `link`. */
  placeholder?: string;
}

const WRAPS: Partial<Record<FormattingAction, Wrap>> = {
  bold: { marker: '**' },
  italic: { marker: '*' },
  strikethrough: { marker: '~~' },
  link: { marker: '__LINK__', placeholder: 'url' },
};

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

  for (const line of text.slice(start, end).split('\n')) {
    const lineEnd = offset + line.length;
    if (line.length > 0) {
      const next = edit(line, index);
      if (next !== null && next !== line) {
        changes.push({ from: offset, to: lineEnd, insert: next });
      }
      index += 1;
    }
    offset = lineEnd + 1;
  }

  return { changes, selection: { anchor: start, head: end } };
}

/** The selected lines that have something on them. */
function contentLines(text: string, from: number, to: number): string[] {
  const { start, end } = lineRange(text, from, to);
  return text
    .slice(start, end)
    .split('\n')
    .filter((line) => line.length > 0);
}

export function applyFormattingAction(
  text: string,
  selection: { from: number; to: number },
  action: FormattingAction,
): FormattingResult | null {
  const { from, to } = selection;
  const selected = text.slice(from, to);

  if (action === 'lineBreak') {
    return { changes: [{ from: to, to, insert: '<br>' }], selection: { anchor: to + 4, head: to + 4 } };
  }

  if (action === 'clear') {
    const cleaned = selected.replace(INLINE_MARKERS, '');
    return { changes: [{ from, to, insert: cleaned }], selection: { anchor: from, head: from + cleaned.length } };
  }

  const level = HEADING_LEVELS[action];
  if (level) {
    const want = `${'#'.repeat(level)} `;
    const alreadyAtLevel = contentLines(text, from, to).every((line) => line.trimStart().startsWith(want));
    return perLine(text, from, to, (line) => {
      const bare = line.replace(ANY_BLOCK_PREFIX, '');
      return alreadyAtLevel ? bare : want + bare;
    });
  }

  const prefixPattern = LINE_PREFIXES[action];
  if (prefixPattern) {
    const already = contentLines(text, from, to).every((line) => prefixPattern.test(line));
    return perLine(text, from, to, (line, index) => {
      if (already) return line.replace(prefixPattern, '');
      const bare = line.replace(ANY_BLOCK_PREFIX, '');
      if (action === 'numberedList') return `${index + 1}. ${bare}`;
      if (action === 'bulletList') return `* ${bare}`;
      return `> ${bare}`;
    });
  }

  const wrap = WRAPS[action];
  if (!wrap) return null;

  if (wrap.placeholder) {
    // A link wraps the selection as its text and leaves the destination
    // selected, because that is the part nobody has yet.
    const label = selected || 'text';
    const insert = `[${label}](${wrap.placeholder})`;
    const urlFrom = from + label.length + 3;
    return {
      changes: [{ from, to, insert }],
      selection: { anchor: urlFrom, head: urlFrom + wrap.placeholder.length },
    };
  }

  const marker = wrap.marker;
  const outside =
    from >= marker.length &&
    to + marker.length <= text.length &&
    text.slice(from - marker.length, from) === marker &&
    text.slice(to, to + marker.length) === marker;
  const inside = selected.length >= marker.length * 2 && selected.startsWith(marker) && selected.endsWith(marker);

  if (outside) {
    return {
      changes: [
        { from: from - marker.length, to: from, insert: '' },
        { from: to, to: to + marker.length, insert: '' },
      ],
      selection: { anchor: from - marker.length, head: to - marker.length },
    };
  }

  if (inside) {
    const bare = selected.slice(marker.length, -marker.length);
    return { changes: [{ from, to, insert: bare }], selection: { anchor: from, head: from + bare.length } };
  }

  // Nothing selected: insert the pair and sit between the markers.
  if (selected.length === 0) {
    return {
      changes: [{ from, to, insert: marker + marker }],
      selection: { anchor: from + marker.length, head: from + marker.length },
    };
  }

  return {
    changes: [{ from, to, insert: marker + selected + marker }],
    selection: { anchor: from + marker.length, head: from + marker.length + selected.length },
  };
}
