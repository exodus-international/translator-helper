/**
 * Rules that judge a document on its own, without comparing it to the source.
 * All carry a safe autofix except `brokenFormatting`, and `no-tab` on a tab
 * that is setting indentation.
 *
 * Thresholds come from the 646-file 2026 corpus: bullets are written `*`
 * (26,274 occurrences vs 0 for `-`), and prose uses curly quotes
 * (20,480 `“` vs straight quotes that appear almost only inside HTML).
 *
 * `no-nbsp` and `no-tab` clean up after a word processor: across the 4,144
 * translated files they find 977 no-break spaces and 692 tabs.
 */

import type { LintDiagnostic, LintEdit, LintRule } from '../types';
import { codeRegions, isProtected, protectedRegions } from '../regions';

const TRAILING_WHITESPACE = /[ \t]+$/gm;

export const trailingWhitespace: LintRule = {
  id: 'trailing-whitespace',
  severity: 'warning',
  description: 'Lines must not end with spaces or tabs.',
  check({ text }) {
    const diagnostics: LintDiagnostic[] = [];
    for (const match of text.matchAll(TRAILING_WHITESPACE)) {
      const from = match.index ?? 0;
      const to = from + match[0].length;
      diagnostics.push({
        ruleId: 'trailing-whitespace',
        severity: 'warning',
        message: 'Trailing whitespace.',
        from,
        to,
        fix: { title: 'Remove trailing whitespace', edits: [{ from, to, insert: '' }] },
      });
    }
    return diagnostics;
  },
};

export const finalNewline: LintRule = {
  id: 'final-newline',
  severity: 'warning',
  description: 'Files must end with exactly one newline.',
  check({ text }) {
    if (text.length === 0 || text.endsWith('\n')) return [];
    return [
      {
        ruleId: 'final-newline',
        severity: 'warning',
        message: 'File does not end with a newline.',
        from: text.length,
        to: text.length,
        fix: { title: 'Add final newline', edits: [{ from: text.length, to: text.length, insert: '\n' }] },
      },
    ];
  },
};

export const noCrlf: LintRule = {
  id: 'no-crlf',
  severity: 'warning',
  description: 'Line endings must be LF, not CRLF.',
  check({ text }) {
    // Reported once per document rather than once per line: a CRLF file is
    // uniformly CRLF, and the corpus has files with 20k+ of them. One
    // diagnostic carrying every edit keeps the editor's gutter usable.
    const edits: LintEdit[] = [];
    for (const match of text.matchAll(/\r\n/g)) {
      const from = match.index ?? 0;
      edits.push({ from, to: from + 2, insert: '\n' });
    }
    if (edits.length === 0) return [];
    return [
      {
        ruleId: 'no-crlf',
        severity: 'warning',
        message: `File uses Windows line endings (${edits.length} CRLF).`,
        from: edits[0].from,
        to: edits[0].to,
        fix: { title: 'Convert all line endings to LF', edits },
      },
    ];
  },
};

const DASH_BULLET = /^([ \t]*)-([ \t]+)/gm;

export const bulletMarker: LintRule = {
  id: 'bullet-marker',
  severity: 'warning',
  description: 'List items use `*`, matching the rest of the content library.',
  check({ text }) {
    const regions = protectedRegions(text);
    const diagnostics: LintDiagnostic[] = [];
    for (const match of text.matchAll(DASH_BULLET)) {
      const dashAt = (match.index ?? 0) + match[1].length;
      if (isProtected(regions, dashAt)) continue;
      diagnostics.push({
        ruleId: 'bullet-marker',
        severity: 'warning',
        message: 'Use `*` for list items, not `-`.',
        from: dashAt,
        to: dashAt + 1,
        fix: { title: 'Replace `-` with `*`', edits: [{ from: dashAt, to: dashAt + 1, insert: '*' }] },
      });
    }
    return diagnostics;
  },
};

const EXCESS_BLANK_LINES = /\n{4,}/g;

export const excessBlankLines: LintRule = {
  id: 'excess-blank-lines',
  severity: 'info',
  description: 'At most two consecutive blank lines.',
  check({ text }) {
    const diagnostics: LintDiagnostic[] = [];
    for (const match of text.matchAll(EXCESS_BLANK_LINES)) {
      const from = match.index ?? 0;
      const to = from + match[0].length;
      diagnostics.push({
        ruleId: 'excess-blank-lines',
        severity: 'info',
        message: `${match[0].length - 1} consecutive blank lines.`,
        from,
        to,
        fix: { title: 'Collapse blank lines', edits: [{ from, to, insert: '\n\n\n' }] },
      });
    }
    return diagnostics;
  },
};

const OPENS_QUOTE = /[\s([{—–“‘>]/;

export const smartQuotes: LintRule = {
  id: 'smart-quotes',
  severity: 'info',
  description: 'Prose uses typographic quotes and apostrophes.',
  check({ text }) {
    const regions = protectedRegions(text);
    const diagnostics: LintDiagnostic[] = [];

    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      if (char !== '"' && char !== "'") continue;
      if (isProtected(regions, i)) continue;

      const before = i > 0 ? text[i - 1] : '';
      const after = i + 1 < text.length ? text[i + 1] : '';

      let replacement: string;
      if (char === '"') {
        replacement = before === '' || OPENS_QUOTE.test(before) ? '“' : '”';
      } else if (/\w/.test(before) && /\w/.test(after)) {
        replacement = '’'; // contraction: don't -> don’t
      } else {
        continue; // standalone single quote is ambiguous; leave it alone
      }

      diagnostics.push({
        ruleId: 'smart-quotes',
        severity: 'info',
        message: `Use the typographic character ${replacement}.`,
        from: i,
        to: i + 1,
        fix: { title: `Replace with ${replacement}`, edits: [{ from: i, to: i + 1, insert: replacement }] },
      });
    }
    return diagnostics;
  },
};

/**
 * Inline formatting that never closes.
 *
 * Emphasis and inline code cannot cross a blank line, so a `*` opened in one
 * paragraph and closed in the next does not set anything off: the reader gets
 * the marker characters in the text, or one run that swallows both paragraphs.
 * The renderer never complains, which is what makes this worth a rule — the
 * most common break in translated content is a quotation wrapped in `*…*` with
 * a stray blank line inside it, and nothing else in the pipeline notices.
 *
 * The check is per paragraph, then across paragraphs: a leftover opener that
 * finds a leftover closer further down is reported once, at the opener, naming
 * the line the closer sits on. A marker that could be literal punctuation —
 * `*` between spaces, an intraword `_` — is not a marker at all.
 */

/** Longest first, so `**` is one token rather than two `*`. */
const MARKER = /(\*+|_+|`+)/g;

/** Runs longer than this are not a formatter this library writes. */
const LONGEST = { '*': 3, _: 2 } as const;

interface Marker {
  kind: string;
  from: number;
  to: number;
  /** Paragraph index, in document order. */
  block: number;
  canOpen: boolean;
  canClose: boolean;
}

function markerName(kind: string): string {
  if (kind === '***') return 'Bold italic';
  if (kind === '**' || kind === '__') return 'Bold';
  if (kind === '`') return 'Inline code';
  return 'Emphasis';
}

function closeTitle(kind: string): string {
  return kind === '`' ? 'Close the code span here' : 'Close the emphasis here';
}

/** Paragraphs: the stretches between blank lines, which is where emphasis ends. */
function blockRanges(text: string): { from: number; to: number }[] {
  const blocks: { from: number; to: number }[] = [];
  let start = 0;
  for (const match of text.matchAll(/\n[ \t]*\n/g)) {
    const at = match.index ?? 0;
    blocks.push({ from: start, to: at });
    start = at + match[0].length;
  }
  blocks.push({ from: start, to: text.length });
  return blocks;
}

/** Where a marker would go to close at the end of its paragraph, bar trailing space. */
function paragraphEnd(text: string, block: { from: number; to: number }): number {
  let at = block.to;
  while (at > block.from && /\s/.test(text[at - 1])) at -= 1;
  return at;
}

/** `**` → `\*\*`: every character escaped, which is what renders the run literally. */
function escapeHint(kind: string): string {
  return kind.replace(/./g, (char) => `\\${char}`);
}

function lineAt(text: string, offset: number): number {
  return text.slice(0, offset).split('\n').length;
}

const isWord = (char: string | undefined) => !!char && /[0-9A-Za-z]/.test(char);
const isSpace = (char: string | undefined) => char === undefined || /\s/.test(char);

export const brokenFormatting: LintRule = {
  id: 'broken-formatting',
  severity: 'error',
  description: 'Emphasis and inline code must open and close inside one paragraph.',
  check({ text }) {
    const regions = protectedRegions(text);
    const blocks = blockRanges(text);
    const leftovers: { marker: Marker; role: 'open' | 'close' }[] = [];

    blocks.forEach((block, blockIndex) => {
      const unpaired: Marker[] = [];

      for (const match of text.slice(block.from, block.to).matchAll(MARKER)) {
        const from = block.from + (match.index ?? 0);
        const to = from + match[0].length;
        if (isProtected(regions, from)) continue;

        const kind = match[0];
        // A run longer than the markdown this library writes: `___` is a
        // fill-in blank on the check-in sheets, `****` is nobody's emphasis.
        const longest = LONGEST[kind[0] as keyof typeof LONGEST] ?? kind.length;
        if (kind.length > longest) continue;

        const before = from > 0 ? text[from - 1] : undefined;
        if (before === '\\') continue; // escaped, so deliberately literal
        const after = text[to];
        // Markdown will not open emphasis before whitespace, nor close it after
        // whitespace; an underscore inside a word is always literal.
        const intraword = kind.startsWith('_');
        const canOpen = !isSpace(after) && (!intraword || !isWord(before));
        const canClose = !isSpace(before) && (!intraword || !isWord(after));
        if (!canOpen && !canClose) continue;

        const marker: Marker = { kind, from, to, block: blockIndex, canOpen, canClose };
        const innermost = unpaired[unpaired.length - 1];
        if (innermost && innermost.kind === kind && canClose) {
          unpaired.pop();
        } else if (canOpen) {
          unpaired.push(marker);
        } else {
          leftovers.push({ marker, role: 'close' });
        }
      }

      for (const marker of unpaired) leftovers.push({ marker, role: 'open' });
    });

    const diagnostics: LintDiagnostic[] = [];
    const claimed = new Set<number>();

    /** Where the marker would land if it closed at the end of its paragraph. */
    const closeEdits = (marker: Marker): LintEdit[] => {
      const at = paragraphEnd(text, blocks[marker.block]);
      return [{ from: at, to: at, insert: marker.kind }];
    };

    // An opener and a closer in different paragraphs is the case the rule exists
    // for, so it is reported once, at the opener, rather than as two orphans.
    leftovers.forEach((entry, index) => {
      if (entry.role !== 'open' || claimed.has(index)) return;

      const pairedAt = leftovers.findIndex(
        (candidate, candidateIndex) =>
          candidateIndex > index &&
          !claimed.has(candidateIndex) &&
          candidate.role === 'close' &&
          candidate.marker.block > entry.marker.block &&
          candidate.marker.kind === entry.marker.kind,
      );
      if (pairedAt === -1) return;

      claimed.add(index);
      claimed.add(pairedAt);
      const opener = entry.marker;
      const closer = leftovers[pairedAt].marker;
      diagnostics.push({
        ruleId: 'broken-formatting',
        severity: 'error',
        message: `${markerName(opener.kind)} opened here is closed in a later paragraph (line ${lineAt(text, closer.from)}). Formatting cannot cross a blank line.`,
        from: opener.from,
        to: opener.to,
        // The repair has to decide where the emphasis ends, which is the
        // translator's call — so it is offered here and never applied by
        // "Fix all". It keeps the emphasis where it was opened and drops the
        // marker that was left holding the far end.
        fix: {
          title: closeTitle(opener.kind),
          edits: [...closeEdits(opener), { from: closer.from, to: closer.to, insert: '' }],
          safe: false,
        },
      });
    });

    leftovers.forEach((entry, index) => {
      if (claimed.has(index)) return;
      const { marker, role } = entry;
      diagnostics.push({
        ruleId: 'broken-formatting',
        severity: 'error',
        message:
          role === 'open'
            ? `${markerName(marker.kind)} opened here is never closed in this paragraph.`
            : `${markerName(marker.kind)} is closed here without an opening marker — if the character is literal, escape it as ${escapeHint(marker.kind)}.`,
        from: marker.from,
        to: marker.to,
        fix:
          role === 'open'
            ? { title: closeTitle(marker.kind), edits: closeEdits(marker), safe: false }
            : {
                title: 'Remove the stray marker',
                edits: [{ from: marker.from, to: marker.to, insert: '' }],
                safe: false,
              },
      });
    });

    return diagnostics;
  },
};

/**
 * Named, because the character is invisible in source and a formatter is free
 * to normalise a literal one out of a string.
 */
const NBSP = String.fromCharCode(0xa0);

/**
 * A one-letter word followed by a no-break space is deliberate: Czech, Slovak
 * and Polish typography forbids leaving a single-letter preposition at the end
 * of a line. 87 of the corpus's 1,064 no-break spaces are that, and they are
 * correct; the other 977 are plain spaces that came out of a word processor,
 * including the ones indenting a `reminder:` block, where the character made
 * the block's own keys look like top-level ones.
 */
function holdsAWordToTheNext(text: string, at: number): boolean {
  const letter = text[at - 1];
  if (!letter || !isLetter(letter)) return false;
  const before = text[at - 2];
  return before === undefined || !(isLetter(before) || /[0-9]/.test(before));
}

/**
 * A letter in any of the ten alphabets the content is translated into, all of
 * them cased Latin. Written this way because `\p{L}` needs an ES2018 regex and
 * this project targets ES2017.
 */
function isLetter(char: string): boolean {
  return char.toLowerCase() !== char.toUpperCase();
}

export const noNbsp: LintRule = {
  id: 'no-nbsp',
  severity: 'warning',
  description: 'No-break spaces belong only where typography needs them.',
  check({ text }) {
    const code = codeRegions(text);
    const diagnostics: LintDiagnostic[] = [];

    for (let at = text.indexOf(NBSP); at !== -1; at = text.indexOf(NBSP, at + 1)) {
      if (isProtected(code, at)) continue;
      if (holdsAWordToTheNext(text, at)) continue;
      diagnostics.push({
        ruleId: 'no-nbsp',
        severity: 'warning',
        message: 'No-break space where a normal space belongs.',
        from: at,
        to: at + 1,
        fix: { title: 'Replace with a normal space', edits: [{ from: at, to: at + 1, insert: ' ' }] },
      });
    }
    return diagnostics;
  },
};

export const noTab: LintRule = {
  id: 'no-tab',
  severity: 'warning',
  description: 'Tabs must be spaces.',
  check({ text }) {
    const code = codeRegions(text);
    const diagnostics: LintDiagnostic[] = [];

    for (const match of text.matchAll(/\t/g)) {
      const from = match.index ?? 0;
      if (isProtected(code, from)) continue;

      // Every tab in the corpus separates an ordered-list marker from its text
      // (`1.<tab>Melchizedek`), pasted out of a word processor; one space reads
      // and renders the same. A tab in a line's leading whitespace is different
      // — it sets nesting depth, and how deep is the author's call — so that
      // one is offered rather than applied.
      const lineFrom = text.lastIndexOf('\n', from - 1) + 1;
      const indenting = /^[^\S\r\n]*$/.test(text.slice(lineFrom, from));

      diagnostics.push({
        ruleId: 'no-tab',
        severity: 'warning',
        message: indenting ? 'Tab used to indent; use spaces.' : 'Tab character; use a space.',
        from,
        to: from + 1,
        fix: {
          title: 'Replace with a space',
          edits: [{ from, to: from + 1, insert: ' ' }],
          ...(indenting ? { safe: false } : {}),
        },
      });
    }
    return diagnostics;
  },
};

export const houseStyleRules: LintRule[] = [
  noCrlf,
  trailingWhitespace,
  finalNewline,
  bulletMarker,
  excessBlankLines,
  smartQuotes,
  brokenFormatting,
  noNbsp,
  noTab,
];
