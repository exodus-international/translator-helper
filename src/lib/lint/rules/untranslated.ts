/**
 * Rules for the part of a file the translator never reached.
 *
 * The parity rules assume someone translated the document and ask whether its
 * structure survived. These ask the prior question. A file gets created by
 * copying the English one, and sometimes it ships that way: across the 4,144
 * source/translation pairs in exodus90/content, 64 files still carry the
 * English body word for word — most of a Spanish field guide among them. In
 * another eleven the prose was translated and a heading was not.
 *
 * Neither rule offers a fix. There is nothing to repair; there is writing to do.
 */

import type { LintDiagnostic, LintRule } from '../types';
import { bodyOffset } from '../frontmatter-entries';

/**
 * Below this, a heading is as likely to be a proper noun the language keeps —
 * `Exodus 90`, `Lectio Divina`, `Amen` — as it is to be untranslated.
 */
const SHORTEST_TELLING_HEADING = 12;

/** Enough prose that two files matching cannot be coincidence. */
const SHORTEST_TELLING_BODY = 200;

const HEADING = /^#{1,6} +(.*)$/gm;

/** Prose alone: markup and whitespace differ for reasons that are not the text. */
function prose(body: string): string {
  return body
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

interface Heading {
  text: string;
  from: number;
  to: number;
}

function headings(text: string): Heading[] {
  const offset = bodyOffset(text);
  const found: Heading[] = [];
  for (const match of text.slice(offset).matchAll(HEADING)) {
    const raw = match[1];
    const text_ = raw.trim();
    const from = offset + (match.index ?? 0) + match[0].length - raw.length + raw.indexOf(text_);
    found.push({ text: text_, from, to: from + text_.length });
  }
  return found;
}

const bodyUntranslated: LintRule = {
  id: 'body-untranslated',
  severity: 'warning',
  description: 'The body must not be the English source verbatim.',
  requiresSource: true,
  check({ text, source }) {
    const original = prose((source ?? '').slice(bodyOffset(source ?? '')));
    if (original.length < SHORTEST_TELLING_BODY) return [];
    if (prose(text.slice(bodyOffset(text))) !== original) return [];
    return [
      {
        ruleId: 'body-untranslated',
        severity: 'warning',
        // It is the whole document that is the finding, not a span in it.
        scope: 'document',
        message: 'The body is still the English source, word for word.',
        from: 0,
        to: 0,
      },
    ];
  },
};

/**
 * Ten of the eleven it finds are real — `Book of the Dead: Exodus Men` over
 * Hungarian prose, `Welcome to Exodus 90!` over Spanish. The eleventh is a
 * name, `Manuel II Palaiologos`, which is the same heading in Dutch because
 * that is how the man is called. Filtering headings whose every word is
 * capitalised would drop him and `Discipline Principles` with him, so the rule
 * says it and a translator spends a second dismissing it.
 */
const headingUntranslated: LintRule = {
  id: 'heading-untranslated',
  severity: 'warning',
  description: 'Headings must be translated along with the prose under them.',
  requiresSource: true,
  check({ text, source }) {
    const original = headings(source ?? '');
    const translated = headings(text);
    // A count mismatch is `heading-structure`'s finding, and pairing headings
    // positionally would be guesswork once the counts differ.
    if (original.length === 0 || original.length !== translated.length) return [];

    // A file nobody has touched has every heading in English; saying so once,
    // as `body-untranslated` does, beats saying it per heading.
    const untouched = prose(text.slice(bodyOffset(text))) === prose((source ?? '').slice(bodyOffset(source ?? '')));
    if (untouched) return [];

    const diagnostics: LintDiagnostic[] = [];
    for (let i = 0; i < translated.length; i++) {
      const heading = translated[i];
      if (heading.text !== original[i].text) continue;
      if (heading.text.length < SHORTEST_TELLING_HEADING) continue;
      // A heading of only digits and punctuation says nothing either way.
      if (heading.text.toLowerCase() === heading.text.toUpperCase()) continue;

      diagnostics.push({
        ruleId: 'heading-untranslated',
        severity: 'warning',
        message: 'This heading is still the English one.',
        from: heading.from,
        to: heading.to,
      });
    }
    return diagnostics;
  },
};

export const untranslatedRules: LintRule[] = [bodyUntranslated, headingUntranslated];
