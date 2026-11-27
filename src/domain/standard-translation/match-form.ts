/**
 * The simplified form standard translations are matched in: wording only, so
 * the same prayer matches whatever layout, quotes or case a document gives it.
 * "> *Glory be to the Father,*" in one document and "Glory be to the Father,"
 * in another are the same entry.
 *
 * Pure and free of server imports: the editor and AI translation share it.
 */

// ─── Layout ───────────────────────────────────────────────

/**
 * What a document wraps around the wording. An entry stores none of it: each
 * occurrence supplies its own (the issue's layout table). In the order the add
 * dialog lists what it left out.
 */
const LAYOUT_PARTS = ['blockquote', 'list', 'heading', 'indentation', 'emphasis', 'comment', 'hard-break'] as const;

export type LayoutPart = (typeof LAYOUT_PARTS)[number];

/** A stretch of the raw text that is layout, not wording. */
interface Cut {
  from: number;
  to: number;
  part: LayoutPart;
}

interface Span {
  from: number;
  to: number;
}

interface Line {
  /** The raw line, without its newline. */
  start: number;
  end: number;
  /** Where a list marker or heading would start, after indentation and blockquote markers. */
  marker: number;
  /** Where the prefix ends. */
  body: number;
  /** The wording, between the prefix and what trails it; empty for a comment-only line. */
  from: number;
  to: number;
  /** Nothing after the prefix: a stanza break. */
  blank: boolean;
}

// Zero-width and format characters are not \s, but read as space: a word
// joiner sits inside a pause comment in real documents.
const BLANK = /[\s​-‍⁠﻿]/u;
const BLANK_ONLY = /^[\s​-‍⁠﻿]*$/u;
const WORD = /[\p{L}\p{N}]/u;
// Line prefixes, in the order Markdown nests them: "  > 1. Amen."
const INDENT = /^[ \t]+/;
const QUOTE = /^(?:>[ \t]*)+/;
const LIST = /^(?:[-*+]|\d{1,9}[.)])(?:[ \t]+|$)/;
const HEADING = /^#{1,6}(?:[ \t]+|$)/;
const DELIMITER_RUN = /\*+|_+/g;

const isBlank = (char: string | undefined) => char === undefined || BLANK.test(char);
const isWord = (char: string | undefined) => char !== undefined && WORD.test(char);

/**
 * A run of `*` or `_` that is emphasis rather than wording, as Markdown decides:
 * it touches a word on at least one side ("5 * 3" is a sum), and an underscore
 * inside a word is part of it ("snake_case").
 */
function isDelimiter(raw: string, from: number, to: number): boolean {
  const before = raw[from - 1];
  const after = raw[to];
  if (isBlank(before) && isBlank(after)) return false;
  return raw[from] === '*' || !(isWord(before) && isWord(after));
}

/**
 * How many delimiters wrap the whole of `spans` (a line, or a paragraph's
 * lines), or 0. "*Glory* be to the *Father*" starts and ends with `*` but is
 * two emphases, so the inside must hold no delimiter run of the same kind;
 * a bold refrain inside an italic line is fine.
 */
function wrapperLength(raw: string, spans: Span[]): number {
  const first = spans[0];
  const last = spans[spans.length - 1];
  const char = raw[first.from];
  if (char !== '*' && char !== '_') return 0;
  let open = 0;
  while (first.from + open < first.to && raw[first.from + open] === char) open++;
  let close = 0;
  while (last.to - close > last.from && raw[last.to - close - 1] === char) close++;
  if (open > 3 || close !== open) return 0;
  if (spans.length === 1 && first.to - first.from <= 2 * open) return 0;
  if (isBlank(raw[first.from + open]) || isBlank(raw[last.to - open - 1])) return 0;
  for (const span of inside(spans, open)) {
    for (const run of raw.slice(span.from, span.to).matchAll(DELIMITER_RUN)) {
      const from = span.from + run.index;
      if (run[0][0] === char && run[0].length === open && isDelimiter(raw, from, from + open)) return 0;
    }
  }
  return open;
}

/** `spans` without `length` characters at the very start and the very end. */
const inside = (spans: Span[], length: number): Span[] =>
  spans.map((span, i) => ({
    from: i === 0 ? span.from + length : span.from,
    to: i === spans.length - 1 ? span.to - length : span.to,
  }));

/** Cuts the emphasis wrapping all of `spans`, nested wrappers included ("**_Amen._**"). */
function cutWrappers(raw: string, spans: Span[], cuts: Cut[]): boolean {
  let found = false;
  for (let length = wrapperLength(raw, spans); length > 0; length = wrapperLength(raw, spans)) {
    const first = spans[0];
    const last = spans[spans.length - 1];
    cuts.push(
      { from: first.from, to: first.from + length, part: 'emphasis' },
      { from: last.to - length, to: last.to, part: 'emphasis' },
    );
    spans = inside(spans, length);
    found = true;
  }
  return found;
}

/**
 * Reads the layout around the wording, line by line: prefixes, comments, hard
 * breaks, and emphasis around a whole paragraph or, failing that, around
 * single lines (the Glory Be italicises each line on its own).
 */
function readLayout(raw: string): { lines: Line[]; cuts: Cut[] } {
  const cuts: Cut[] = [];
  // Everything here is linear in the text: this runs on a 20,000-character
  // entry for every save, and over whole documents when matching. Comments are
  // found with indexOf rather than a lazy regex, which rescans to the end from
  // every unclosed `<!--`, and looked up through a per-character index.
  const comments: Span[] = [];
  const commentOf = new Int32Array(raw.length).fill(-1);
  for (let open = raw.indexOf('<!--'); open !== -1; ) {
    const close = raw.indexOf('-->', open + 4);
    if (close === -1) break;
    const span = { from: open, to: close + 3 };
    commentOf.fill(comments.length, span.from, span.to);
    comments.push(span);
    cuts.push({ ...span, part: 'comment' });
    open = raw.indexOf('<!--', span.to);
  }
  const commentAt = (i: number): Span | undefined => comments[commentOf[i]];
  const isFiller = (i: number) => isBlank(raw[i]) || commentOf[i] !== -1;

  const texts = raw.split('\n');
  const lines: Line[] = [];
  let start = 0;
  for (const [index, text] of texts.entries()) {
    const end = start + text.length;
    const lineStart = start;
    start = end + 1;
    const inComment = commentAt(lineStart);
    if (!inComment && BLANK_ONLY.test(text)) {
      lines.push({ start: lineStart, end, marker: end, body: end, from: end, to: end, blank: true });
      continue;
    }

    let pos = inComment ? Math.min(inComment.to, end) : lineStart;
    let marker = lineStart;
    const eat = (pattern: RegExp, part: LayoutPart) => {
      const match = pattern.exec(raw.slice(pos, end));
      if (!match) return false;
      cuts.push({ from: pos, to: pos + match[0].length, part });
      pos += match[0].length;
      return true;
    };
    if (!inComment) {
      eat(INDENT, 'indentation');
      eat(QUOTE, 'blockquote');
      marker = pos;
      if (!eat(LIST, 'list')) eat(HEADING, 'heading');
      if (BLANK_ONLY.test(raw.slice(pos, end))) {
        lines.push({ start: lineStart, end, marker, body: pos, from: pos, to: pos, blank: true });
        continue;
      }
    }
    // The rest of a comment from the line above is no prefix.
    const body = inComment ? lineStart : pos;

    let to = end;
    // A hard break only breaks a line that something follows.
    const next = texts[index + 1];
    if (next !== undefined && !/^[\s>]*$/.test(next)) {
      let spaces = text.length;
      while (spaces > 0 && (text[spaces - 1] === ' ' || text[spaces - 1] === '\t')) spaces--;
      if (text.endsWith('\\') && !text.endsWith('\\\\')) {
        cuts.push({ from: end - 1, to: end, part: 'hard-break' });
        to = end - 1;
      } else if (text.length - spaces >= 2) {
        cuts.push({ from: lineStart + spaces, to: end, part: 'hard-break' });
      }
    }
    while (to > pos && isFiller(to - 1)) to--;
    let from = pos;
    while (from < to && isFiller(from)) from++;
    lines.push({ start: lineStart, end, marker, body, from, to, blank: false });
  }

  // Paragraphs run between blank lines; a comment-only line doesn't end one.
  let paragraph: Span[] = [];
  const closeParagraph = () => {
    if (paragraph.length > 0 && !cutWrappers(raw, paragraph, cuts) && paragraph.length > 1) {
      for (const line of paragraph) cutWrappers(raw, [line], cuts);
    }
    paragraph = [];
  };
  for (const line of lines) {
    if (line.blank) closeParagraph();
    else if (line.from < line.to) paragraph.push(line);
  }
  closeParagraph();

  return { lines, cuts };
}

function droppedBy(length: number, cuts: Cut[]): Uint8Array {
  const dropped = new Uint8Array(length);
  for (const cut of cuts) dropped.fill(1, cut.from, cut.to);
  return dropped;
}

// ─── The match form ───────────────────────────────────────

// Typography differs by language and by who typed it: „…“, «…», “…”, ’ and
// ' are the same quotation, and every dash is the same dash.
const FOLD = new Map<string, string>([
  ...[...'“”„‟«»"″'].map((c): [string, string] => [c, '"']),
  ...[...'‘’‚‛\'′'].map((c): [string, string] => [c, "'"]),
  ...[...'‐‑‒–—―−'].map((c): [string, string] => [c, '-']),
]);

/**
 * The text as matching sees it, with a map back to the raw text: Markdown
 * emphasis, line prefixes, comments and hard-break backslashes dropped;
 * quotes and dashes unified; whitespace collapsed to one space and trimmed;
 * lower case.
 *
 * `map[i]` is the raw index of the character that produced `key[i]`, and
 * `map[key.length]` the raw index just after the last kept character (0 for
 * an empty key). A match `[from, to)` in the key is the raw span
 * `[map[from], map[to - 1] + 1)`: exactly the matched wording, with whatever
 * layout lies between its words, and none around it. A character whose lower
 * case is longer ("İ" → "i̇") maps every character it produced to itself.
 */
export function toMatchForm(raw: string): { key: string; map: number[] } {
  const dropped = droppedBy(raw.length, readLayout(raw).cuts);
  for (const run of raw.matchAll(DELIMITER_RUN)) {
    if (isDelimiter(raw, run.index, run.index + run[0].length)) dropped.fill(1, run.index, run.index + run[0].length);
  }

  let key = '';
  const map: number[] = [];
  let space = -1;
  for (let i = 0; i < raw.length; ) {
    const char = String.fromCodePoint(raw.codePointAt(i)!);
    const next = i + char.length;
    // Layout between words is no space: "Glory<!-- -->be" is one word.
    if (dropped[i]) {
      i = next;
      continue;
    }
    if (isBlank(char)) {
      if (key && space < 0) space = i;
    } else {
      if (space >= 0) {
        key += ' ';
        map.push(space);
        space = -1;
      }
      const folded = FOLD.get(char) ?? char.toLowerCase();
      for (let k = 0; k < folded.length; k++) map.push(k === folded.length - 1 ? next - 1 : Math.min(i + k, next - 1));
      key += folded;
    }
    i = next;
  }
  map.push(map.length > 0 ? map[map.length - 1] + 1 : 0);
  return { key, map };
}

/**
 * The key an entry's source is stored and matched under: unique per language
 * and scope, so the same wording in any layout is the same entry.
 */
export const sourceKeyOf = (text: string): string => toMatchForm(text).key;

// ─── Stripping layout ─────────────────────────────────────

/**
 * The wording of a selection, as an entry stores it: line and stanza breaks
 * and formatting inside the text kept, the layout around it removed. Lists
 * what it removed, each part once, so the add dialog can say what it left out.
 */
export function stripLayout(raw: string): { text: string; removed: LayoutPart[] } {
  const { lines, cuts } = readLayout(raw);
  const dropped = droppedBy(raw.length, cuts);

  const out: string[] = [];
  for (const line of lines) {
    if (line.blank) {
      // One blank line is a stanza break; more say nothing more.
      if (out.length > 0 && out[out.length - 1] !== '') out.push('');
      continue;
    }
    if (line.from >= line.to) continue;
    let text = '';
    for (let i = line.from; i < line.to; i++) {
      // A comment between words leaves one space, not two.
      if (dropped[i] || (raw[i] === ' ' && dropped[i - 1] && text.endsWith(' '))) continue;
      text += raw[i];
    }
    out.push(text);
  }
  if (out[out.length - 1] === '') out.pop();

  return {
    text: out.join('\n'),
    removed: LAYOUT_PARTS.filter((part) => cuts.some((cut) => cut.part === part)),
  };
}

// ─── Reading each line's layout ───────────────────────────

/**
 * One raw line, cut where its layout meets its wording, so an entry's wording
 * can take the wording's place (`layout.ts`). The fields, in this order, make
 * up the raw line.
 */
export interface LineLayout {
  /** Nothing after the prefix: a stanza break. */
  blank: boolean;
  /** Indentation and blockquote markers. */
  prefix: string;
  /** A list marker or heading, with the space after it. */
  marker: string;
  /** Spaces and comments between the prefix and the wording. */
  lead: string;
  /**
   * Emphasis around the whole line, or opening on the first line of the
   * paragraph it wraps; `close` ends it, on the paragraph's last line.
   */
  open: string;
  /** The wording, formatting inside it included; empty on a line that holds only a comment. */
  text: string;
  close: string;
  /** Everything after: spaces, comments, a hard break. */
  tail: string;
}

/** Each line of `raw`, cut into its layout and its wording as `toMatchForm` and `stripLayout` read them. */
export function readLines(raw: string): LineLayout[] {
  const { lines, cuts } = readLayout(raw);
  // Wrappers are the only emphasis cuts: pairs at the ends of a line or paragraph.
  const opens = new Map<number, number>();
  const closes = new Map<number, number>();
  for (const cut of cuts) {
    if (cut.part !== 'emphasis') continue;
    opens.set(cut.from, cut.to);
    closes.set(cut.to, cut.from);
  }

  return lines.map((line): LineLayout => {
    // Nested wrappers ("**_Amen._**") are a cut each, end to end.
    let close = line.to;
    for (let at = closes.get(close); at !== undefined && at >= line.from; at = closes.get(close)) close = at;
    let open = line.from;
    for (let at = opens.get(open); at !== undefined && at <= close; at = opens.get(open)) open = at;
    return {
      blank: line.blank,
      prefix: raw.slice(line.start, line.marker),
      marker: raw.slice(line.marker, line.body),
      lead: raw.slice(line.body, line.from),
      open: raw.slice(line.from, open),
      text: raw.slice(open, close),
      close: raw.slice(close, line.to),
      tail: raw.slice(line.to, line.end),
    };
  });
}
