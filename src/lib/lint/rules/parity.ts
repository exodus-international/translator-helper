/**
 * Rules that compare a translation against its English source.
 *
 * These catch the failure mode that actually shows up in the content
 * repository: a translator edits structure that is supposed to be carried over
 * verbatim. Measured across 1,753 real source/translation pairs in
 * exodus90/content, these rules flag 64 rewritten `hero` slugs, 27 dropped
 * frontmatter keys, 283 files that lost a URL, 185 files whose heading
 * structure drifted, and one file where the *key* `hero` was translated to
 * `hrdina`.
 */

import type { LintDiagnostic, LintEdit, LintRule } from '../types';
import { scanFrontmatter } from '../frontmatter-entries';

/** Keys the content team uses. Anything else is almost always a translated key. */
export const KNOWN_FRONTMATTER_KEYS = ['title', 'subtitle', 'caption', 'hero', 'day', 'verse_tag', 'lectionary number'];

/** Keys whose *value* is an identifier or number, never prose to translate. */
export const NON_TRANSLATABLE_KEYS = ['hero', 'day', 'verse_tag', 'lectionary number'];

export const frontmatterKeyTranslated: LintRule = {
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

export const frontmatterMissingKey: LintRule = {
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
      const at = last ? last.lineTo : translation.endOffset;
      // Slugs and numbers carry over verbatim; prose is left for the translator.
      const value = NON_TRANSLATABLE_KEYS.includes(entry.key) ? ` ${entry.value}` : '';

      diagnostics.push({
        ruleId: 'frontmatter-missing-key',
        severity: 'error',
        message: `Frontmatter is missing "${entry.key}", which the source defines.`,
        from: translation.entries[0]?.lineFrom ?? 0,
        to: translation.entries[0]?.lineTo ?? 0,
        fix: {
          title: `Add "${entry.key}"`,
          edits: [{ from: at, to: at, insert: `\n${entry.key}:${value}` }],
        },
      });
    }
    return diagnostics;
  },
};

export const frontmatterValueChanged: LintRule = {
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

export const linkUrlChanged: LintRule = {
  id: 'link-url-changed',
  severity: 'error',
  description: 'Link and media URLs must be carried over from the source unchanged.',
  requiresSource: true,
  check({ text, source }) {
    const translated = destinations(text);
    const original = destinations(source ?? '');
    if (original.length === 0) return [];

    // Different counts means content was added or dropped; the positional
    // pairing below would be meaningless, so report it as one finding.
    if (translated.length !== original.length) {
      const originalUrls = new Set(original.map((d) => d.url));
      const translatedUrls = new Set(translated.map((d) => d.url));
      const lost = [...originalUrls].filter((url) => !translatedUrls.has(url));
      if (lost.length === 0) return [];
      return [
        {
          ruleId: 'link-url-changed',
          severity: 'error',
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

export const headingStructure: LintRule = {
  id: 'heading-structure',
  severity: 'warning',
  description: 'Heading levels must mirror the source document.',
  requiresSource: true,
  check({ text, source }) {
    const translated = headings(text);
    const original = headings(source ?? '');
    if (original.length === 0) return [];

    if (translated.length !== original.length) {
      return [
        {
          ruleId: 'heading-structure',
          severity: 'warning',
          message: `Translation has ${translated.length} heading(s), the source has ${original.length}.`,
          from: translated[0]?.from ?? 0,
          to: translated[0]?.to ?? 0,
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

export const parityRules: LintRule[] = [
  frontmatterKeyTranslated,
  frontmatterMissingKey,
  frontmatterValueChanged,
  linkUrlChanged,
  headingStructure,
];
