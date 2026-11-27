import { parseFrontmatter } from '@/lib/frontmatter';
import {
  findCitations,
  findQuotedText,
  formatInlineQuote,
  formatReading,
  normalizeCitation,
  READING_HEADING,
  readingAfter,
  similarity,
  untaggedReading,
  type Reading,
} from './citations';

export { similarity, type Reading };

/**
 * Scripture is never translated by the AI. Before the source goes to the model,
 * every Scripture reading and citation the in-app Bible can resolve is swapped for a
 * placeholder (`{{bible:1}}`); after the model answers, each placeholder is filled
 * from the target language's Catholic Bible: a reading with its official text, a
 * citation as that Bible writes it (`Psalm 46:10` becomes `Ps 46,11` in Croatian,
 * which numbers psalm titles as verses). `verse_tag` is set the same way.
 *
 * Readings are the passage a document is built on, in the two shapes the content
 * uses:
 * - a day's `# A Reading from …` heading, whose italic text is its `verse_tag`
 *   (when `verse_tag` is empty, the passage is found by the reading's text);
 * - a line holding only a citation (`<span …>James 5:11-13</span>`) followed by
 *   the italic text.
 *
 * What the Bible can't resolve stays in the source for the model to translate,
 * and comes back as a notice for the translator to check. The feature is on for
 * every language with an imported Bible (see src/domain/bible).
 */

const LOG_PREFIX = '[Scripture]';
const MAX_REFS = 200;
const MAX_HINT_CHARS = 2_000;
// How close the English reading is to the RSV-CE text of its citation. Below
// MIN_SIMILARITY it is shortened or another translation: the full passage goes in,
// with a notice. Below MIN_SAME_PASSAGE it is likely another passage altogether --
// a lectionary psalm numbered differently -- and is left to the model.
const MIN_SIMILARITY = 0.9;
const MIN_SAME_PASSAGE = 0.6;
// A quotation is the whole passage when it has this share of the passage's words.
const MIN_WHOLE_QUOTE = 0.95;

// Citations are found as the editor's Scripture check finds them (see
// ./citations), so the draft and the check agree on what a document cites.
// "Day 9" and "At 5:30" may be candidates; the Bible says unknown_book and
// they are left alone, without a notice.

/** The whole text is one citation: a citation line before a reading. */
function isCitation(text: string): boolean {
  const [only, ...rest] = findCitations(text);
  return !!only && rest.length === 0 && only.from === 0 && only.to === text.length;
}

/** Replaces each citation in the text with what `replace` returns for it. */
function replaceCitations(text: string, replace: (citation: string, raw: string) => string): string {
  let out = '';
  let at = 0;
  for (const { text: citation, raw, from, to } of findCitations(text)) {
    out += text.slice(at, from) + replace(citation, raw);
    at = to;
  }
  return out + text.slice(at);
}

const CITATION_LINE = /^<span\b[^>]*>\s*(.+?)\s*<\/span>$/;
const FRONTMATTER = /^(﻿?---[ \t]*\r?\n)([\s\S]*?)(\r?\n---)/;
const VERSE_TAG_LINE = /^verse_tag:[ \t]*(.*)$/m;
const PLACEHOLDER = /\{\{bible:\d+\}\}/;
const PLACEHOLDERS = new RegExp(PLACEHOLDER.source, 'g');

const placeholder = (n: number) => `{{bible:${n}}}`;

/** How much of `part`'s words `whole` has, from 0 to 1: a quotation of a few words from a long verse scores high. */
function coverage(part: string, whole: string): number {
  const words = (text: string) => text.toLowerCase().match(/\p{L}+/gu) ?? [];
  const pool = new Map<string, number>();
  for (const w of words(whole)) pool.set(w, (pool.get(w) ?? 0) + 1);
  const quoted = words(part);
  let found = 0;
  for (const w of quoted) {
    const left = pool.get(w) ?? 0;
    if (left > 0) {
      found++;
      pool.set(w, left - 1);
    }
  }
  return quoted.length ? found / quoted.length : 0;
}

// ─── Finding Scripture in the source ──────────────────────

/** The readings in a document body, given its `verse_tag`. */
export function findReadings(body: string, verseTag: string | null): Reading[] {
  const lines = body.split('\n');
  const readings: Reading[] = [];
  const headings = lines.flatMap((line, i) => (READING_HEADING.test(line) ? [i] : []));
  // A verse_tag says which reading it is only when there is exactly one.
  if (verseTag && headings.length === 1) {
    const reading = readingAfter(lines, verseTag, headings[0]);
    if (reading) readings.push(reading);
  }
  lines.forEach((line, i) => {
    const citation = line.trim().match(CITATION_LINE)?.[1];
    if (!citation || !isCitation(citation)) return;
    const reading = readingAfter(lines, normalizeCitation(citation), i);
    if (reading) readings.push(reading);
  });
  return readings;
}

// ─── The Bible ────────────────────────────────────────────

export interface PassageResult {
  ref: string;
  status: string;
  rendered?: string;
  verses?: Array<{ text: string }>;
  notes?: string[];
  source?: { text?: string; verses?: Array<{ text: string }> };
}

type Resolved = PassageResult & { rendered: string; verses: Array<{ text: string }> };

const isResolved = (r: PassageResult | undefined): r is Resolved =>
  !!r && (r.status === 'ok' || r.status === 'partial') && !!r.rendered && !!r.verses?.length;

/**
 * Resolves references into the language's Bible, with the RSV-CE side. Null when
 * the language has no Bible. Throws when the Bible can't be read.
 */
export type PassageLookup = (refs: string[], languageCode: string) => Promise<Map<string, PassageResult> | null>;

const inAppBible: PassageLookup = async (refs, languageCode) => {
  const { bibleForLanguage, resolvePassages } = await import('@/domain/bible/bible.service');
  const bible = await bibleForLanguage(languageCode);
  if (!bible) return null;
  const { results } = await resolvePassages(refs, bible.code, { rendered: true, text: true, verses: true, source: true });
  return new Map(results.map((r) => [r.ref, r]));
};

/** Finds the RSV-CE passage a reading is by its text; null when it is not found. */
export type PassageIdentify = (text: string) => Promise<string | null>;

const inAppIdentify: PassageIdentify = async (text) => {
  const { identifyPassage } = await import('@/domain/bible/bible.service');
  return identifyPassage(text);
};

const noIdentify: PassageIdentify = async () => null;

// ─── Text ─────────────────────────────────────────────────

/**
 * The reading as italic text, in the paragraphs and line breaks of the source.
 * The RSV-CE verses say which verses each source paragraph holds.
 */
const formatResolvedReading = (passage: Resolved, reading: Reading) =>
  formatReading(
    passage.verses.map((v) => v.text),
    reading.layout,
    passage.source?.verses?.map((v) => v.text),
  );

// ─── Preparing and restoring ──────────────────────────────

export interface PreparedScripture {
  /** The source with resolved Scripture replaced by placeholders. */
  content: string;
  /** What the model is told about the placeholders; empty when there are none. */
  prompt: string;
  /** Fills the placeholders in the model's translation and sets `verse_tag`. */
  restore(translation: string): { content: string; notices: string[] };
}

const unchanged = (content: string, notices: string[] = []): PreparedScripture => ({
  content,
  prompt: '',
  restore: (translation) => ({ content: translation, notices }),
});

/** Statuses meaning the match is not a Bible reference at all ("At 5:30"): no notice. */
const NOT_A_REFERENCE = new Set(['unparseable', 'unknown_book']);

function unresolvedNotice(citation: string, result: PassageResult | undefined, what: string): string[] {
  if (result && NOT_A_REFERENCE.has(result.status)) return [];
  const why = result?.notes?.join(' ') || result?.status || 'no answer';
  return [`${citation}: not in the Bible (${why}) -- the AI translated the ${what}; check it against the official text.`];
}

/**
 * Swaps the source's resolvable Scripture for placeholders. Leaves the source
 * untouched when the language has no Bible or the Bible can't be read; the model
 * then translates the Scripture as before, and when the Bible could not be read
 * a notice says so.
 */
export async function prepareScripture(
  source: string,
  languageCode: string,
  lookup: PassageLookup = inAppBible,
  identify: PassageIdentify = lookup === inAppBible ? inAppIdentify : noIdentify,
): Promise<PreparedScripture> {
  if (PLACEHOLDER.test(source)) return unchanged(source);

  const frontmatter = source.match(FRONTMATTER)?.[0] ?? '';
  const lines = source.slice(frontmatter.length).split('\n');
  const { data } = parseFrontmatter(source);
  let verseTag = typeof data.verse_tag === 'string' && data.verse_tag.trim() ? normalizeCitation(data.verse_tag) : null;

  // With no verse_tag, the day's reading is found by its text.
  const notices: string[] = [];
  const untagged = verseTag ? null : untaggedReading(source);
  let foundByText = false;
  if (untagged) {
    // Finding a reading by its text takes several searches; a language with no Bible has no use for it.
    let hasBible = true;
    try {
      hasBible = (await lookup([], languageCode)) !== null;
    } catch {
      // The lookup below meets the same failure and says so.
    }
    if (!hasBible) return unchanged(source);
    try {
      verseTag = await identify(untagged.text);
    } catch (error) {
      console.error(`${LOG_PREFIX} Finding the reading by its text failed:`, error instanceof Error ? error.message : error);
    }
    foundByText = verseTag !== null;
    if (!foundByText) {
      notices.push(
        `"${untagged.heading}" has no verse_tag and its text was not found in RSV-CE, so the AI translated the reading; check it against the official text and add the verse_tag.`,
      );
    }
  }

  const readings = findReadings(lines.join('\n'), verseTag);
  const outsideReadings = lines.filter((_, i) => !readings.some((r) => i >= r.start && i < r.end)).join('\n');
  const inline = [...new Set(findCitations(outsideReadings).map((c) => c.text))];
  const refs = [...new Set([...(verseTag ? [verseTag] : []), ...readings.map((r) => r.citation), ...inline])];
  if (refs.length === 0) return unchanged(source, notices);

  let results: Map<string, PassageResult> | null;
  try {
    results = await lookup(refs.slice(0, MAX_REFS), languageCode);
  } catch (error) {
    console.error(`${LOG_PREFIX} Bible lookup failed:`, error instanceof Error ? error.message : error);
    return unchanged(source, [
      ...notices,
      'The Bible could not be read, so the AI translated the Scripture. Check it against the official text.',
    ]);
  }
  // Most languages have no Bible, and their translations are the model's as before: a notice on every one would only be noise.
  if (!results || [...results.values()].every((r) => r.status === 'unknown_language')) return unchanged(source);

  const fills = new Map<string, { text: string; count: number; label: string }>();
  const fill = (text: string, label: string) => {
    const key = placeholder(fills.size + 1);
    fills.set(key, { text, count: 1, label });
    return key;
  };

  // Readings, replaced bottom up so the line numbers above stay valid.
  const placed: Array<{ key: string; reading: Reading }> = [];
  for (const reading of readings) {
    const result = results.get(reading.citation);
    if (!isResolved(result)) {
      notices.push(...unresolvedNotice(reading.citation, result, 'reading'));
      continue;
    }
    const match = result.source?.text ? similarity(reading.text, result.source.text) : 1;
    if (match < MIN_SAME_PASSAGE) {
      notices.push(
        `${reading.citation}: the English reading does not match this passage in RSV-CE (another numbering or translation?) -- the AI translated it; check it against the official text.`,
      );
      continue;
    }
    if (result.status === 'partial') notices.push(`${reading.citation}: ${result.notes?.join(' ')}`);
    if (match < MIN_SIMILARITY) {
      notices.push(
        `${reading.citation}: the English reading is shortened or from another translation. The full ${result.rendered} was inserted; trim it to match.`,
      );
    }
    placed.push({ key: fill(formatResolvedReading(result, reading), `the reading ${result.rendered}`), reading });
  }
  const body = [...lines];
  for (const { key, reading } of placed.sort((a, b) => b.reading.start - a.reading.start)) {
    body.splice(reading.start, reading.end - reading.start, key);
  }

  // Quotations beside a citation: the official wording when the source quotes the
  // whole passage, so the model never writes Scripture out itself. Back to front,
  // so earlier offsets hold.
  let bodyText = body.join('\n');
  const quotes: Array<{ from: number; to: number; key: string }> = [];
  for (const found of findCitations(bodyText)) {
    const citation = found.text;
    const result = results.get(citation);
    if (!isResolved(result) || !result.source?.text) continue;
    const quote = findQuotedText(bodyText, found);
    if (quote?.kind !== 'quote' || quotes.some((q) => quote.from < q.to && q.from < quote.to)) continue;
    const likeness = similarity(quote.plain, result.source.text);
    // Similar is not enough: a quotation that drops a clause still scores high,
    // and filling it would add words the source left out.
    if (likeness >= MIN_SIMILARITY && coverage(result.source.text, quote.plain) >= MIN_WHOLE_QUOTE) {
      const text = formatInlineQuote(result.verses.map((v) => v.text));
      quotes.push({ from: quote.from, to: quote.to, key: fill(text, `the quotation of ${result.rendered}`) });
    } else if (likeness >= MIN_SAME_PASSAGE || coverage(quote.plain, result.source.text) >= MIN_SIMILARITY) {
      notices.push(
        `${citation}: the quotation beside it is shortened or from another translation, so the AI translated it -- check it against ${result.rendered}.`,
      );
    }
  }
  for (const { from, to, key } of quotes.sort((a, b) => b.from - a.from)) {
    bodyText = bodyText.slice(0, from) + key + bodyText.slice(to);
  }

  // Citations, one placeholder for each distinct one.
  const citationKeys = new Map<string, string>();
  const hints: string[] = [];
  const withCitations = replaceCitations(bodyText, (citation, raw) => {
    const result = results.get(citation);
    if (!isResolved(result)) return raw;
    const known = citationKeys.get(citation);
    if (known) {
      fills.get(known)!.count++;
      return known;
    }
    const key = fill(result.rendered, result.rendered);
    citationKeys.set(citation, key);
    const text = result.verses.map((v) => v.text).join(' ');
    hints.push(`${key} (${result.rendered}): ${text.length > MAX_HINT_CHARS ? `${text.slice(0, MAX_HINT_CHARS)}…` : text}`);
    return key;
  });
  for (const citation of inline) {
    if (citationKeys.has(citation) || readings.some((r) => r.citation === citation)) continue;
    notices.push(...unresolvedNotice(citation, results.get(citation), 'citation'));
  }

  const tag = verseTag ? results.get(verseTag) : undefined;
  // A passage found by its text is the verse_tag only once the reading was filled from it.
  const trusted = !foundByText || placed.some((p) => p.reading.citation === verseTag);
  const verseTagValue = isResolved(tag) && trusted ? tag.rendered : null;
  if (verseTag && !foundByText && !verseTagValue && !readings.some((r) => r.citation === verseTag)) {
    notices.push(...unresolvedNotice(verseTag, tag, 'verse_tag'));
  }
  if (untagged && foundByText && verseTagValue) {
    notices.push(
      `"${untagged.heading}" had no verse_tag; by its text the reading is ${verseTag}, so it was filled from ${verseTagValue} and verse_tag set to it. Check that it is the right passage.`,
    );
  }

  const prompt =
    fills.size === 0
      ? ''
      : [
          "Scripture: the placeholders {{bible:1}}, {{bible:2}}, … stand for Scripture readings, quotations and citations. After translation each is replaced with the official text of the target language's Catholic Bible.",
          'Keep every placeholder exactly as written, as often and where it appears in the source. Do not translate, write out or repeat the Scripture it stands for.',
          ...(hints.length
            ? [
                'Where the text quotes one of the cited passages, use its official wording, quoting no more than the source does:',
                ...hints.map((h) => `- ${h}`),
              ]
            : []),
        ].join('\n');

  return {
    content: frontmatter + withCitations,
    prompt,
    restore(translation) {
      const restoreNotices = [...notices];
      let content = translation;
      for (const [key, { text, count, label }] of fills) {
        const parts = content.split(key);
        if (parts.length - 1 < count) restoreNotices.push(`The AI dropped ${label}; add it where it belongs.`);
        content = parts.join(text);
      }
      if (PLACEHOLDER.test(content)) {
        content = content.replace(PLACEHOLDERS, '');
        restoreNotices.push('The AI added Scripture placeholders that were not in the source; they were removed.');
      }
      return { content: verseTagValue ? applyVerseTag(content, verseTagValue) : content, notices: restoreNotices };
    },
  };
}

/** Sets the translation's `verse_tag`, keeping its quotes. */
export function applyVerseTag(translation: string, rendered: string): string {
  return translation.replace(FRONTMATTER, (whole, open: string, body: string, close: string) => {
    if (!VERSE_TAG_LINE.test(body)) return whole;
    const next = body.replace(VERSE_TAG_LINE, (_line, value: string) => {
      const quote = /^["']/.test(value) ? value[0] : /: |\s#/.test(rendered) ? '"' : '';
      return `verse_tag: ${quote}${rendered}${quote}`;
    });
    return `${open}${next}${close}`;
  });
}
