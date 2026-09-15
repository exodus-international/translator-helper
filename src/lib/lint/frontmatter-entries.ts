/**
 * Offset-aware scan of the frontmatter block.
 *
 * `parseFrontmatter` in @/lib/frontmatter gives values but not positions, and
 * diagnostics need to point at the exact key or value they are complaining
 * about. This keeps the raw line geometry alongside the parsed text.
 *
 * Only top-level keys are entries. Indented lines belong to the key above them
 * — the `reminder:` block on a day file carries its own `title:` and `body:` —
 * and reading those as keys in their own right made `body` look like a key
 * nobody recognised and `title` look like a duplicate of the real one.
 */

import { frontmatterRegion } from './regions';

export interface FrontmatterEntry {
  key: string;
  value: string;
  /** Offsets of the key token, e.g. `hero` in `hero: shirt-e90_2026`. */
  keyFrom: number;
  keyTo: number;
  /** Offsets of the value, trimmed. Empty values collapse to a caret position. */
  valueFrom: number;
  valueTo: number;
  /** Offsets of the whole line, excluding its newline. */
  lineFrom: number;
  lineTo: number;
  /**
   * End offset of the key's indented block, for a key written as a nested
   * mapping. Equal to `lineTo` when nothing is indented beneath the key, so
   * `text.slice(lineFrom, blockTo)` is always the whole entry.
   */
  blockTo: number;
}

export interface FrontmatterScan {
  present: boolean;
  entries: FrontmatterEntry[];
  /** Offset just past the closing `---`, where a new key can be appended. */
  endOffset: number;
}

const KEY_LINE = /^([^:\n]+):(.*)$/;

/**
 * An indented line continues the key above it rather than starting one.
 *
 * Any whitespace counts, not just space and tab: files pasted out of Word
 * indent the `reminder:` block with a non-breaking space, and treating that as
 * column zero turned the block's `body:` into a key nobody recognised. The
 * NBSP is still wrong — `no-nbsp` reports it, and in those words.
 */
const NESTED_LINE = /^[^\S\r\n]/;

export function scanFrontmatter(text: string): FrontmatterScan {
  const region = frontmatterRegion(text);
  if (!region) return { present: false, entries: [], endOffset: 0 };

  const entries: FrontmatterEntry[] = [];
  const block = text.slice(region.from, region.to);
  const lines = block.split('\n');

  let offset = region.from;
  for (const rawLine of lines) {
    const line = rawLine.replace(/\r$/, '');
    const lineFrom = offset;
    offset += rawLine.length + 1; // + newline

    if (line === '---') continue;

    // An indented line extends the entry above it. A blank line is skipped
    // without closing the block, so a stray gap inside one does not split it.
    if (line.trim() === '' || NESTED_LINE.test(line)) {
      const open = entries[entries.length - 1];
      if (open && line.trim() !== '') open.blockTo = lineFrom + line.length;
      continue;
    }

    const match = KEY_LINE.exec(line);
    if (!match) continue;

    const [, rawKey, rawValue] = match;
    const key = rawKey.trim();
    const keyFrom = lineFrom + rawKey.indexOf(key);
    const keyTo = keyFrom + key.length;

    const value = rawValue.trim();
    const valueStartInLine = rawKey.length + 1 + (value ? rawValue.indexOf(value) : rawValue.length);
    const valueFrom = lineFrom + valueStartInLine;
    const lineTo = lineFrom + line.length;

    entries.push({
      key,
      value,
      keyFrom,
      keyTo,
      valueFrom,
      valueTo: valueFrom + value.length,
      lineFrom,
      lineTo,
      blockTo: lineTo,
    });
  }

  return { present: true, entries, endOffset: region.to };
}

/** Offset of the body (everything after the frontmatter block and its newline). */
export function bodyOffset(text: string): number {
  const region = frontmatterRegion(text);
  if (!region) return 0;
  const rest = text.slice(region.to);
  const newline = /^\r?\n/.exec(rest);
  return region.to + (newline ? newline[0].length : 0);
}
