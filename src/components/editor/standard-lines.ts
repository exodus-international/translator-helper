import type { DiffPart } from '@/domain/scripture/citations';
import { toMatchForm } from '@/domain/standard-translation/match-form';

/**
 * Laying a standard translation out line by line, in the editor and its card.
 * A standard text found across lines spans the layout between them (the
 * `*` closing one line, the `> *` opening the next); its highlight marks the
 * wording on each line and leaves that layout plain, as the source is shown.
 */

export interface Span {
  from: number;
  to: number;
}

/**
 * The wording of `doc[from, to)`, one span per line it runs over: the layout
 * Markdown wraps around each line (blockquote markers, emphasis, comments) is
 * left out, the layout inside a line's wording is not. A range on one line is
 * returned as it is: the check's ranges already start and end on wording.
 */
export function wordingSpans(doc: string, from: number, to: number): Span[] {
  const newline = doc.indexOf('\n', from);
  if (newline === -1 || newline >= to) return [{ from, to }];

  // Whole lines, so the layout is read in the context Markdown reads it in.
  const start = from > 0 ? doc.lastIndexOf('\n', from - 1) + 1 : 0;
  const after = doc.indexOf('\n', to);
  const { key, map } = toMatchForm(doc.slice(start, after === -1 ? doc.length : after));

  const spans: Span[] = [];
  let lineEnd = -1;
  for (let i = 0; i < key.length; i++) {
    if (key[i] === ' ') continue;
    const at = start + map[i];
    if (at < from || at >= to) continue;
    const last = spans[spans.length - 1];
    if (last && at < lineEnd) {
      last.to = at + 1;
    } else {
      spans.push({ from: at, to: at + 1 });
      const end = doc.indexOf('\n', at);
      lineEnd = end === -1 ? doc.length : end;
    }
  }
  return spans;
}

/**
 * A word diff against the standard text, broken where the standard text's
 * lines break: the diff joins words with spaces, and a prayer reads by its
 * lines. Words only in the translation stay on the line they follow.
 */
export function diffLines(parts: DiffPart[], standard: string): DiffPart[][] {
  // Where each line of the standard text ends, counted in its words.
  const ends: number[] = [];
  let words = 0;
  for (const line of standard.split('\n')) {
    const count = line.split(/\s+/).filter(Boolean).length;
    if (count === 0) continue;
    words += count;
    ends.push(words);
  }

  const lines: DiffPart[][] = [[]];
  let line = 0;
  let seen = 0;
  const push = (type: DiffPart['type'], word: string) => {
    const current = lines[lines.length - 1];
    const last = current[current.length - 1];
    if (last?.type === type) last.text += ` ${word}`;
    else current.push({ type, text: word });
  };
  for (const part of parts) {
    for (const word of part.text.split(' ')) {
      if (part.type !== 'delete') {
        if (seen === ends[line] && line < ends.length - 1) {
          line++;
          lines.push([]);
        }
        seen++;
      }
      push(part.type, word);
    }
  }
  return lines;
}
