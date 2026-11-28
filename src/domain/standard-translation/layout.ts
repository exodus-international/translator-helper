/**
 * A standard translation rendered in the layout of the place it's used: the
 * entry holds the wording, each occurrence supplies the layout (the issue's
 * layout table). AI translation fills a `{{std:n}}` placeholder with it, and
 * the editor's "Use standard text" puts it over a translation's lines.
 *
 * Pure and free of server imports: the editor and AI translation share it.
 */

import { emphasisOf, readLines, type LineLayout } from './match-form';

/**
 * What to check after a render, each worth a warning:
 * - `pause-moved`: the line counts differed, so a comment (a pause marker)
 *   that wasn't on the occurrence's last line was moved to the end of it.
 * - `formatting-differs`: the formatting inside the wording differs between
 *   the occurrence and the entry; the entry's is kept.
 */
export type LayoutNotice = 'pause-moved' | 'formatting-differs';

const isBlank = (line: string) => line.trim() === '';
const isWording = (line: LineLayout) => !line.blank && line.text !== '';

/**
 * Lines with wording as `l`, the stanza breaks between them as `|`: "ll|l".
 * Several blank lines are one stanza break, as `stripLayout` keeps them.
 */
function shapeOf(blanks: boolean[]): string {
  let shape = '';
  for (const blank of blanks) {
    if (!blank) shape += 'l';
    else if (shape !== '' && !shape.endsWith('|')) shape += '|';
  }
  return shape.endsWith('|') ? shape.slice(0, -1) : shape;
}

/**
 * `target` (an entry's wording) in the layout of `occurrence` (the full raw
 * lines it covers: prefixes, wrapping emphasis, comments, hard breaks and the
 * stanza breaks between them included).
 *
 * When the occurrence's lines and stanzas have the shape of the entry's, line
 * i of the entry takes the place of the wording on line i, and everything else
 * on that line stays. Otherwise the entry's lines and stanzas are used, as
 * `reflow` lays them out.
 *
 * A single italic line stays one italic line: the entry's lines are kept, with
 * the italics opening on the first and closing on the last, so they render as
 * one italic line (soft breaks render as spaces: `breaks: false` in
 * `src/lib/markdown.ts`) and the entry's line breaks survive for the editor.
 */
export function renderInLayout(occurrence: string, target: string): { text: string; notices: LayoutNotice[] } {
  const lines = readLines(occurrence);
  const targetLines = target.split('\n');
  const wording = lines.filter(isWording);
  if (wording.length === 0) return { text: target, notices: [] };

  const notices: LayoutNotice[] = [];
  const sameShape =
    shapeOf(lines.filter((line) => line.blank || isWording(line)).map((line) => line.blank)) ===
    shapeOf(targetLines.map(isBlank));
  let text: string;
  if (sameShape) {
    text = lineForLine(lines, targetLines.filter((line) => !isBlank(line)));
  } else {
    const reflowed = reflow(lines, targetLines);
    text = reflowed.text;
    if (reflowed.moved) notices.push('pause-moved');
  }
  const inner = (raw: string) => emphasisOf(raw).join();
  if (inner(wording.map((line) => line.text).join('\n')) !== inner(target)) notices.push('formatting-differs');
  return { text, notices };
}

const join = (line: LineLayout, text: string) =>
  line.prefix + line.marker + line.lead + line.open + text + line.close + line.tail;

/** The same shape: each line of the entry replaces the wording of its line. */
function lineForLine(lines: LineLayout[], wording: string[]): string {
  let next = 0;
  return lines.map((line) => join(line, isWording(line) ? wording[next++] : line.text)).join('\n');
}

/** A hard break ending a line's tail (`\` or two or more spaces), or ''. */
function hardBreakIn(tail: string): string {
  if (tail.endsWith('\\')) return '\\';
  let spaces = tail.length;
  while (spaces > 0 && (tail[spaces - 1] === ' ' || tail[spaces - 1] === '\t')) spaces--;
  return tail.length - spaces >= 2 ? tail.slice(spaces) : '';
}

/**
 * The hard break that ends every line of the occurrence a line of the same
 * paragraph follows, or '' when some don't have one. It is how the occurrence
 * breaks lines, not an extra tied to one line, so the entry's lines get it too.
 */
function hardBreakOf(lines: LineLayout[]): string {
  const breaks: string[] = [];
  let previous: LineLayout | undefined;
  for (const line of lines) {
    if (line.blank) previous = undefined;
    else if (isWording(line)) {
      if (previous) breaks.push(hardBreakIn(previous.tail));
      previous = line;
    }
  }
  return breaks.length > 0 && breaks.every((brk) => brk !== '') ? breaks[0] : '';
}

/**
 * The emphasis wrapping the occurrence, and whether it wraps each line or each
 * paragraph (one `*` opening on a paragraph's first line and closing on its
 * last, a single line included). Read from the first paragraph; when only some
 * lines are wrapped, none of the entry's are.
 */
function wrapperOf(lines: LineLayout[]): { open: string; close: string; each: 'line' | 'paragraph' } {
  const paragraph: LineLayout[] = [];
  for (const line of lines) {
    if (line.blank && paragraph.length > 0) break;
    if (isWording(line)) paragraph.push(line);
  }
  const first = paragraph[0];
  if (first.open !== '' && (paragraph.length === 1 || first.close === '')) {
    return { open: first.open, close: paragraph[paragraph.length - 1].close, each: 'paragraph' };
  }
  if (lines.every((line) => !isWording(line) || line.open !== '')) {
    return { open: first.open, close: first.close, each: 'line' };
  }
  return { open: '', close: '', each: 'line' };
}

/**
 * The comments in a line's lead or tail, the spaces around them dropped; ''
 * when it holds none. A comment spanning lines leaves a piece on each, so a
 * piece counts too.
 */
const extraIn = (layout: string) => (layout.includes('<!--') || layout.includes('-->') ? layout.trim() : '');

/**
 * Different shapes: the entry's lines and stanzas, in the layout the
 * occurrence's lines share.
 * - The first line's prefix on every line. A list marker or heading goes on the
 *   first line only, the lines after it indented by its width so they stay in
 *   the list item; a stanza break is the prefix without its trailing space
 *   (`>` in a blockquote).
 * - Wrapping emphasis as `wrapperOf` reads it, around each line or paragraph.
 * - The occurrence's hard break, when all its lines had one (`hardBreakOf`),
 *   after every line of a paragraph but its last.
 * - Comments at the end of the last line: no line of the entry is known to
 *   match a line of the occurrence, so `moved` says when any was elsewhere.
 *   Comments before the first line's wording stay there.
 */
function reflow(lines: LineLayout[], target: string[]): { text: string; moved: boolean } {
  const wording = lines.filter(isWording);
  const first = wording[0];
  const last = wording[wording.length - 1];
  const continuation = first.prefix + ' '.repeat(first.marker.length);
  const stanzaBreak = continuation.trimEnd();
  const wrapper = wrapperOf(lines);
  const hardBreak = hardBreakOf(lines);

  const extras: string[] = [];
  for (const line of lines) {
    if (line.blank) continue;
    if (line !== first) extras.push(extraIn(line.lead));
    if (line !== last) extras.push(extraIn(line.tail.slice(0, line.tail.length - hardBreakIn(line.tail).length)));
  }
  const moved = extras.filter((extra) => extra !== '');
  const lastEnd = moved.map((extra) => ` ${extra}`).join('') + last.tail;

  let lastWording = target.length - 1;
  while (lastWording > 0 && isBlank(target[lastWording])) lastWording--;
  let started = false;
  const out = target.map((text, i) => {
    if (isBlank(text)) return stanzaBreak;
    const head = started ? continuation : first.prefix + first.marker + first.lead;
    started = true;
    const opensParagraph = i === 0 || isBlank(target[i - 1]);
    const endsParagraph = i === target.length - 1 || isBlank(target[i + 1]);
    const open = wrapper.each === 'line' || opensParagraph ? wrapper.open : '';
    const close = wrapper.each === 'line' || endsParagraph ? wrapper.close : '';
    const end = i === lastWording ? lastEnd : endsParagraph ? '' : hardBreak;
    return head + open + text + close + end;
  });
  return { text: out.join('\n'), moved: moved.length > 0 };
}
