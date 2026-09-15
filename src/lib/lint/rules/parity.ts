/**
 * Rules that compare a translation against its English source.
 *
 * These catch the failure mode that actually shows up in the content
 * repository: a translator edits structure that is supposed to be carried over
 * verbatim. Measured across the 4,144 source/translation pairs in
 * exodus90/content, they flag 79 rewritten `hero` slugs, 277 files with a
 * dropped frontmatter key, 316 that lost a URL, 428 whose heading structure
 * drifted, one renumbered `section_order`, three files whose `verse_tag` was
 * left blank, and ten files where a *key* was mistyped or translated —
 * `hrdina` for `hero`, `Day` for `day`, `## title` for `title`.
 */

import type { LintDiagnostic, LintEdit, LintRule } from '../types';
import { bodyOffset, scanFrontmatter } from '../frontmatter-entries';

/**
 * Keys the content team uses. Anything else is almost always a translated key.
 *
 * `identifier` and `section_order` are required on every field guide section,
 * `sort_order` on most exercise root files, and `reminder` heads the nested
 * block on a day file. All four were missing here, so the rule below reported
 * 593 of them as keys a translator had invented.
 */
const KNOWN_FRONTMATTER_KEYS = [
  'title',
  'subtitle',
  'caption',
  'hero',
  'day',
  'verse_tag',
  'lectionary number',
  'identifier',
  'section_order',
  'sort_order',
  'reminder',
];

/**
 * Keys whose *value* is an identifier or number, never prose to translate.
 *
 * `verse_tag` is deliberately not one of them. A scripture citation localises
 * on every axis: the book name (`Matthew` → `Mt`, `Izl`, `Éxodo`), the
 * chapter/verse separator (a comma in cs, de, hr, hu, pl, sk and sl; a colon
 * in lt and nl; a comma and a space in es), and the verse numbers themselves,
 * because Bible editions genuinely versify differently — the Czech `Daniel
 * 3,98-4,9` really is the English `Daniel 4:1-12`. Treating it as a slug made
 * this rule fire on 1,903 of 4,144 pairs, in all ten languages, and its fix
 * was safe, so "fix all" rewrote correct citations back into English.
 */
const NON_TRANSLATABLE_KEYS = ['hero', 'day', 'lectionary number', 'identifier', 'section_order', 'sort_order'];

const frontmatterKeyTranslated: LintRule = {
  id: 'frontmatter-key-translated',
  severity: 'error',
  description: 'Frontmatter keys are identifiers and must stay in English.',
  requiresSource: true,
  check({ text, source }) {
    const translation = scanFrontmatter(text);
    const original = scanFrontmatter(source ?? '');
    if (!translation.present || !original.present) return [];

    const translationKeys = new Set(translation.entries.map((e) => e.key));
    const missingFromTranslation = original.entries.map((e) => e.key).filter((key) => !translationKeys.has(key));

    const diagnostics: LintDiagnostic[] = [];
    for (const entry of translation.entries) {
      if (KNOWN_FRONTMATTER_KEYS.includes(entry.key)) continue;

      // When exactly one source key is unaccounted for, this unknown key is
      // almost certainly it, translated — so the rename is a safe autofix.
      const candidate = missingFromTranslation.length === 1 ? missingFromTranslation[0] : null;

      diagnostics.push({
        ruleId: 'frontmatter-key-translated',
        severity: 'error',
        message: candidate
          ? `Unknown frontmatter key "${entry.key}". The source has "${candidate}" — keys must not be translated.`
          : `Unknown frontmatter key "${entry.key}".`,
        from: entry.keyFrom,
        to: entry.keyTo,
        fix: candidate
          ? {
              title: `Rename to "${candidate}"`,
              edits: [{ from: entry.keyFrom, to: entry.keyTo, insert: candidate }],
            }
          : undefined,
      });
    }
    return diagnostics;
  },
};

const frontmatterMissingKey: LintRule = {
  id: 'frontmatter-missing-key',
  severity: 'error',
  description: 'Every frontmatter key in the source must exist in the translation.',
  requiresSource: true,
  check({ text, source }) {
    const translation = scanFrontmatter(text);
    const original = scanFrontmatter(source ?? '');
    if (!translation.present || !original.present) return [];

    const translationKeys = new Set(translation.entries.map((e) => e.key));
    const unknownInTranslation = translation.entries.filter((e) => !KNOWN_FRONTMATTER_KEYS.includes(e.key));

    const diagnostics: LintDiagnostic[] = [];
    for (const entry of original.entries) {
      if (translationKeys.has(entry.key)) continue;
      // A single unknown key is reported (and fixed) as a rename instead.
      if (unknownInTranslation.length === 1) continue;

      // Insert after the same-named neighbour when we can, else at the end.
      const last = translation.entries[translation.entries.length - 1];
      const at = last ? last.blockTo : translation.endOffset;
      // A key written as a nested mapping (`reminder:`) carries its whole block
      // over, prose included: inserting a bare `reminder:` would leave the
      // translator a null value and lose the text they are meant to translate.
      const nested = entry.blockTo > entry.lineTo;
      // Slugs and numbers carry over verbatim; prose is left for the translator.
      const value = NON_TRANSLATABLE_KEYS.includes(entry.key) ? ` ${entry.value}` : '';
      const insert = nested ? `\n${(source ?? '').slice(entry.lineFrom, entry.blockTo)}` : `\n${entry.key}:${value}`;

      diagnostics.push({
        ruleId: 'frontmatter-missing-key',
        severity: 'error',
        message: `Frontmatter is missing "${entry.key}", which the source defines.`,
        from: translation.entries[0]?.lineFrom ?? 0,
        to: translation.entries[0]?.lineTo ?? 0,
        fix: {
          title: `Add "${entry.key}"`,
          edits: [{ from: at, to: at, insert }],
        },
      });
    }
    return diagnostics;
  },
};

const frontmatterValueChanged: LintRule = {
  id: 'frontmatter-value-changed',
  severity: 'error',
  description: 'Slug and numeric frontmatter values must match the source exactly.',
  requiresSource: true,
  check({ text, source }) {
    const translation = scanFrontmatter(text);
    const original = scanFrontmatter(source ?? '');
    if (!translation.present || !original.present) return [];

    const originalByKey = new Map(original.entries.map((e) => [e.key, e]));
    const diagnostics: LintDiagnostic[] = [];

    for (const entry of translation.entries) {
      if (!NON_TRANSLATABLE_KEYS.includes(entry.key)) continue;
      const sourceEntry = originalByKey.get(entry.key);
      if (!sourceEntry || sourceEntry.value === entry.value) continue;

      diagnostics.push({
        ruleId: 'frontmatter-value-changed',
        severity: 'error',
        message: `"${entry.key}" must match the source ("${sourceEntry.value}"), found "${entry.value}".`,
        from: entry.valueFrom,
        to: entry.valueTo,
        fix: {
          title: `Restore "${sourceEntry.value}"`,
          edits: [{ from: entry.valueFrom, to: entry.valueTo, insert: sourceEntry.value }],
        },
      });
    }
    return diagnostics;
  },
};

/**
 * A key the source fills in but the translation leaves blank.
 *
 * Three files in exodus90/content carry a bare `verse_tag:` — the citation was
 * never localised and the reader gets a day with no scripture reference. The
 * fix offers the English citation as a starting point, but is never applied by
 * "fix all": a citation has to be rewritten into the target language's Bible,
 * not pasted in.
 */
const frontmatterValueEmpty: LintRule = {
  id: 'frontmatter-value-empty',
  severity: 'error',
  description: 'A frontmatter key the source fills in must not be left blank.',
  requiresSource: true,
  check({ text, source }) {
    const translation = scanFrontmatter(text);
    const original = scanFrontmatter(source ?? '');
    if (!translation.present || !original.present) return [];

    const originalByKey = new Map(original.entries.map((e) => [e.key, e]));
    const diagnostics: LintDiagnostic[] = [];

    for (const entry of translation.entries) {
      if (entry.value !== '') continue;
      // `reminder:` keeps its content on the lines indented beneath it, so its
      // own value is empty on every correctly written file.
      if (entry.blockTo > entry.lineTo) continue;

      const sourceEntry = originalByKey.get(entry.key);
      if (!sourceEntry || sourceEntry.value === '') continue;

      diagnostics.push({
        ruleId: 'frontmatter-value-empty',
        severity: 'error',
        // The value is zero-width, so the key carries the marker.
        from: entry.keyFrom,
        to: entry.keyTo,
        message: `"${entry.key}" is blank; the source has "${sourceEntry.value}".`,
        fix: {
          title: `Fill in from the source ("${sourceEntry.value}")`,
          edits: [{ from: entry.lineFrom, to: entry.lineTo, insert: `${entry.key}: ${sourceEntry.value}` }],
          safe: false,
        },
      });
    }
    return diagnostics;
  },
};

interface Destination {
  url: string;
  from: number;
  to: number;
}

/** Markdown link/image destinations plus `href`/`src` attributes, in order. */
function destinations(text: string): Destination[] {
  const found: Destination[] = [];
  for (const match of text.matchAll(/!?\[[^\]]*\]\(([^)\s]*)/g)) {
    const open = match[0].lastIndexOf('(');
    const from = (match.index ?? 0) + open + 1;
    found.push({ url: match[1], from, to: from + match[1].length });
  }
  for (const match of text.matchAll(/(?:href|src)="([^"]*)"/g)) {
    const from = (match.index ?? 0) + match[0].indexOf('"') + 1;
    found.push({ url: match[1], from, to: from + match[1].length });
  }
  return found.sort((a, b) => a.from - b.from);
}

const linkUrlChanged: LintRule = {
  id: 'link-url-changed',
  severity: 'error',
  description: 'Link and media URLs must be carried over from the source unchanged.',
  requiresSource: true,
  check({ text, source }) {
    const translated = destinations(text);
    const original = destinations(source ?? '');
    if (original.length === 0) return [];

    // Different counts means content was added or dropped; the positional
    // pairing below would be meaningless, so report it as one finding. It is a
    // document-level finding: nothing in the text is the problem, so it has no
    // range and consumers show it beside the editor, not above line 1.
    if (translated.length !== original.length) {
      const originalUrls = new Set(original.map((d) => d.url));
      const translatedUrls = new Set(translated.map((d) => d.url));
      const lost = [...originalUrls].filter((url) => !translatedUrls.has(url));
      if (lost.length === 0) return [];
      return [
        {
          ruleId: 'link-url-changed',
          severity: 'error',
          scope: 'document',
          message:
            `Translation has ${translated.length} link(s), the source has ${original.length}. ` +
            `Missing: ${lost.slice(0, 3).join(', ')}${lost.length > 3 ? ` (+${lost.length - 3} more)` : ''}`,
          from: 0,
          to: 0,
        },
      ];
    }

    const diagnostics: LintDiagnostic[] = [];
    for (let i = 0; i < translated.length; i++) {
      if (translated[i].url === original[i].url) continue;
      diagnostics.push({
        ruleId: 'link-url-changed',
        severity: 'error',
        message: `URL differs from the source ("${original[i].url}").`,
        from: translated[i].from,
        to: translated[i].to,
        fix: {
          title: 'Restore the source URL',
          edits: [{ from: translated[i].from, to: translated[i].to, insert: original[i].url }],
          // Translators legitimately swap a link for a same-language
          // equivalent (a Czech article in place of the English one), so this
          // is offered, never applied by "fix all".
          safe: false,
        },
      });
    }
    return diagnostics;
  },
};

interface Heading {
  level: number;
  from: number;
  to: number;
}

function headings(text: string): Heading[] {
  const found: Heading[] = [];
  for (const match of text.matchAll(/^(#{1,6})[ \t]/gm)) {
    const from = match.index ?? 0;
    found.push({ level: match[1].length, from, to: from + match[1].length });
  }
  return found;
}

const headingStructure: LintRule = {
  id: 'heading-structure',
  severity: 'warning',
  description: 'Heading levels must mirror the source document.',
  requiresSource: true,
  check({ text, source }) {
    const translated = headings(text);
    const original = headings(source ?? '');
    if (original.length === 0) return [];

    // A count mismatch says nothing about any single heading, so it is a
    // document-level finding. Anchoring it at the first heading (or at 0 when
    // there are none) put an underline and a marker on a line that was not
    // itself wrong; the status bar carries it instead.
    if (translated.length !== original.length) {
      return [
        {
          ruleId: 'heading-structure',
          severity: 'warning',
          scope: 'document',
          message: `Translation has ${translated.length} heading(s), the source has ${original.length}.`,
          from: 0,
          to: 0,
        },
      ];
    }

    const diagnostics: LintDiagnostic[] = [];
    for (let i = 0; i < translated.length; i++) {
      if (translated[i].level === original[i].level) continue;
      const marker = '#'.repeat(original[i].level);
      const edits: LintEdit[] = [{ from: translated[i].from, to: translated[i].to, insert: marker }];
      diagnostics.push({
        ruleId: 'heading-structure',
        severity: 'warning',
        message: `Heading is level ${translated[i].level}, the source uses level ${original[i].level}.`,
        from: translated[i].from,
        to: translated[i].to,
        fix: { title: `Change to ${marker}`, edits },
      });
    }
    return diagnostics;
  },
};

const LINE_BREAK = /<br\s*\/?>/gi;

/** Explicit line breaks in the body, which the corpus uses for verse and prayer. */
function lineBreaks(text: string): number {
  return text.slice(bodyOffset(text)).match(LINE_BREAK)?.length ?? 0;
}

/**
 * The source breaks lines explicitly and the translation breaks none at all.
 *
 * The corpus sets scripture, prayers and litanies as one `<p>` full of `<br>`,
 * so a translation with none renders the whole stanza as a paragraph. 282 of
 * the 4,144 pairs do this. Any other difference in the count is left alone:
 * 959 pairs have one, the deltas run from one to two thousand, and a
 * translator who joins two short lines is not making a mistake — only losing
 * every break is unambiguous.
 */
const lineBreaksDropped: LintRule = {
  id: 'line-breaks-dropped',
  severity: 'warning',
  description: 'A translation must keep the explicit line breaks its source uses.',
  requiresSource: true,
  check({ text, source }) {
    const original = lineBreaks(source ?? '');
    if (original === 0 || lineBreaks(text) > 0) return [];
    return [
      {
        ruleId: 'line-breaks-dropped',
        severity: 'warning',
        // Nothing in the text is the problem; what is missing has no position.
        scope: 'document',
        message: `The source breaks ${original} line(s) with <br>; this translation breaks none.`,
        from: 0,
        to: 0,
      },
    ];
  },
};

export const parityRules: LintRule[] = [
  frontmatterKeyTranslated,
  frontmatterMissingKey,
  frontmatterValueChanged,
  frontmatterValueEmpty,
  linkUrlChanged,
  headingStructure,
  lineBreaksDropped,
];
