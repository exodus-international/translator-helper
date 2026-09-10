/**
 * Rules that judge a document on its own, without comparing it to the source.
 * Every one of these carries a safe autofix.
 *
 * Thresholds come from the 646-file 2026 corpus: bullets are written `*`
 * (26,274 occurrences vs 0 for `-`), and prose uses curly quotes
 * (20,480 `“` vs straight quotes that appear almost only inside HTML).
 */

import type { LintDiagnostic, LintEdit, LintRule } from '../types';
import { isProtected, protectedRegions } from '../regions';

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

export const houseStyleRules: LintRule[] = [
  noCrlf,
  trailingWhitespace,
  finalNewline,
  bulletMarker,
  excessBlankLines,
  smartQuotes,
];
