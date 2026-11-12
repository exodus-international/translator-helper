import { parseFrontmatter } from '@/lib/frontmatter';

/**
 * Scripture is never translated by the AI. Before the source goes to the model,
 * every Scripture reading and citation the Bible API can resolve is swapped for a
 * placeholder (`{{bible:1}}`); after the model answers, each placeholder is filled
 * from the target language's Catholic Bible: a reading with its official text, a
 * citation as that Bible writes it (`Psalm 46:10` becomes `Ps 46,11` in Croatian,
 * which numbers psalm titles as verses). `verse_tag` is set the same way.
 *
 * Readings are the passage a document is built on, in the two shapes the content
 * uses:
 * - a day's `# A Reading from …` heading, whose italic text is its `verse_tag`;
 * - a line holding only a citation (`<span …>James 5:11-13</span>`) followed by
 *   the italic text.
 *
 * What the API can't resolve stays in the source for the model to translate, and
 * comes back as a notice for the translator to check. The feature is off unless
 * BIBLE_API_URL and BIBLE_API_TOKEN are set.
 */

const LOG_PREFIX = '[Scripture]';
const TIMEOUT_MS = 10_000;
const MAX_REFS = 200;
const MAX_HINT_CHARS = 2_000;
// How close the English reading is to the RSV-CE text of its citation. Below
// MIN_SIMILARITY it is shortened or another translation: the full passage goes in,
// with a notice. Below MIN_SAME_PASSAGE it is likely another passage altogether --
// a lectionary psalm numbered differently -- and is left to the model.
const MIN_SIMILARITY = 0.9;
const MIN_SAME_PASSAGE = 0.6;

// A book is one capitalised word, optionally numbered ("1 Corinthians", "I John")
// or joined by "of" ("Song of Songs"), optionally abbreviated with a full stop.
// A chapter and verse are required, so "Exodus 90" and "Day 9" are never citations.
const BOOK = String.raw`(?:(?:[1-3]|I{1,3})\s?)?[A-Z][a-z]+\.?(?:\sof\s(?:the\s)?[A-Z][a-z]+)?`;
const RANGE = String.raw`\d+(?::\d+)?[a-z]?(?:\s?[-–]\s?\d+(?::\d+)?[a-z]?)?`;
// Further ranges ("6:1-6, 16-18", "8:28; 12:1-2"), unless the number starts another book ("2 Peter").
const CITATION_SOURCE = String.raw`\b${BOOK}\s\d+:\d+[a-z]?(?:\s?[-–]\s?\d+(?::\d+)?[a-z]?)?(?:\s?[,;]\s?${RANGE}(?![\d:]|\s?[A-Z]))*`;
const CITATION = new RegExp(CITATION_SOURCE, 'g');
const CITATION_ONLY = new RegExp(String.raw`^${CITATION_SOURCE}$`);

const READING_HEADING = /^#{1,6}[ \t]+A Reading\b/;
const CITATION_LINE = /^<span\b[^>]*>\s*(.+?)\s*<\/span>$/;
const READING_END = /^\s*(?:#{1,6}\s|<span\b|(?:-{3,}|\*{3,})\s*$)/;
const FRONTMATTER = /^(﻿?---[ \t]*\r?\n)([\s\S]*?)(\r?\n---)/;
const VERSE_TAG_LINE = /^verse_tag:[ \t]*(.*)$/m;
const PLACEHOLDER = /\{\{bible:\d+\}\}/;
const PLACEHOLDERS = new RegExp(PLACEHOLDER.source, 'g');

const placeholder = (n: number) => `{{bible:${n}}}`;
const normalizeCitation = (c: string) => c.replace(/\s+/g, ' ').trim();

// ─── Finding Scripture in the source ──────────────────────

export interface Reading {
  citation: string;
  /** Line indexes of the italic text, end exclusive. */
  start: number;
  end: number;
  /** The source prints a verse per line rather than one paragraph. */
  linePerVerse: boolean;
  text: string;
}

/**
 * The reading's text: from line `from` to the next heading, citation line or
 * rule. It may hold elisions (". . .") and plain paragraphs between the italic
 * ones, so it is never cut at the first one. It must start in italics.
 */
function readingAfter(lines: string[], citation: string, line: number): Reading | null {
  let start = line + 1;
  while (start < lines.length && !lines[start].trim()) start++;
  if (!/^[*_]/.test(lines[start]?.trim() ?? '')) return null;
  let end = start;
  for (let i = start; i < lines.length && !READING_END.test(lines[i]); i++) {
    if (lines[i].trim()) end = i + 1;
  }
  const text = lines.slice(start, end).filter((l) => l.trim());
  return { citation, start, end, linePerVerse: text.length > 1, text: text.join(' ') };
}

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
    if (!citation || !CITATION_ONLY.test(citation)) return;
    const reading = readingAfter(lines, normalizeCitation(citation), i);
    if (reading) readings.push(reading);
  });
  return readings;
}

// ─── The Bible API ────────────────────────────────────────

export interface PassageResult {
  ref: string;
  status: string;
  rendered?: string;
  verses?: Array<{ text: string }>;
  notes?: string[];
  source?: { text?: string };
}

type Resolved = PassageResult & { rendered: string; verses: Array<{ text: string }> };

const isResolved = (r: PassageResult | undefined): r is Resolved =>
  !!r && (r.status === 'ok' || r.status === 'partial') && !!r.rendered && !!r.verses?.length;

function bibleApiConfig() {
  const url = process.env.BIBLE_API_URL?.replace(/\/+$/, '');
  const token = process.env.BIBLE_API_TOKEN;
  return url && token ? { url, token } : null;
}

/** Throws when the API can't be reached or refuses the request. */
async function fetchPassages(refs: string[], languageCode: string): Promise<Map<string, PassageResult>> {
  const { url, token } = bibleApiConfig()!;
  const response = await fetch(`${url}/v1/passages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ lang: languageCode, refs, include: { rendered: true, text: true, verses: true, source: true } }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`Bible API answered ${response.status}: ${(await response.text()).slice(0, 300)}`);
  const { data } = (await response.json()) as { data: PassageResult[] };
  return new Map(data.map((r) => [r.ref, r]));
}

// ─── Text ─────────────────────────────────────────────────

const escapeMarkdown = (text: string) => text.replace(/([\\*_`])/g, '\\$1');

/** The reading as an italic block, a verse per line when the source had one. */
function formatReading(passage: Resolved, linePerVerse: boolean): string {
  const verses = passage.verses.map((v) => escapeMarkdown(v.text.replace(/\s+/g, ' ').trim()));
  return `*${verses.join(linePerVerse ? '\n' : ' ')}*`;
}

const words = (text: string) => text.toLowerCase().match(/\p{L}+/gu) ?? [];

/** How much two texts share their words, from 0 to 1 (the Dice coefficient over word counts). */
export function similarity(a: string, b: string): number {
  const wa = words(a);
  const wb = words(b);
  if (wa.length + wb.length === 0) return 1;
  const counts = new Map<string, number>();
  for (const w of wa) counts.set(w, (counts.get(w) ?? 0) + 1);
  let shared = 0;
  for (const w of wb) {
    const n = counts.get(w) ?? 0;
    if (n > 0) {
      shared++;
      counts.set(w, n - 1);
    }
  }
  return (2 * shared) / (wa.length + wb.length);
}

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
  return [`${citation}: not in the Bible API (${why}) -- the AI translated the ${what}; check it against the official text.`];
}

/**
 * Swaps the source's resolvable Scripture for placeholders. Leaves the source
 * untouched when the feature is off or the API fails; the model then translates
 * the Scripture as before, and a notice says so.
 */
export async function prepareScripture(source: string, languageCode: string): Promise<PreparedScripture> {
  if (!bibleApiConfig() || PLACEHOLDER.test(source)) return unchanged(source);

  const frontmatter = source.match(FRONTMATTER)?.[0] ?? '';
  const lines = source.slice(frontmatter.length).split('\n');
  const { data } = parseFrontmatter(source);
  const verseTag = typeof data.verse_tag === 'string' && data.verse_tag.trim() ? normalizeCitation(data.verse_tag) : null;

  const readings = findReadings(lines.join('\n'), verseTag);
  const outsideReadings = lines.filter((_, i) => !readings.some((r) => i >= r.start && i < r.end)).join('\n');
  const inline = [...new Set((outsideReadings.match(CITATION) ?? []).map(normalizeCitation))];
  const refs = [...new Set([...(verseTag ? [verseTag] : []), ...readings.map((r) => r.citation), ...inline])];
  if (refs.length === 0) return unchanged(source);

  let results: Map<string, PassageResult>;
  try {
    results = await fetchPassages(refs.slice(0, MAX_REFS), languageCode);
  } catch (error) {
    console.error(`${LOG_PREFIX} Bible API request failed:`, error instanceof Error ? error.message : error);
    return unchanged(source, ['The Bible API could not be reached, so the AI translated the Scripture. Check it against the official text.']);
  }
  if ([...results.values()].every((r) => r.status === 'unknown_language')) {
    return unchanged(source, [`The Bible API has no Bible for "${languageCode}", so the AI translated the Scripture.`]);
  }

  const notices: string[] = [];
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
    placed.push({ key: fill(formatReading(result, reading.linePerVerse), `the reading ${result.rendered}`), reading });
  }
  const body = [...lines];
  for (const { key, reading } of placed.sort((a, b) => b.reading.start - a.reading.start)) {
    body.splice(reading.start, reading.end - reading.start, key);
  }

  // Citations, one placeholder for each distinct one.
  const citationKeys = new Map<string, string>();
  const hints: string[] = [];
  const withCitations = body.join('\n').replace(CITATION, (match) => {
    const citation = normalizeCitation(match);
    const result = results.get(citation);
    if (!isResolved(result)) return match;
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
  const verseTagValue = isResolved(tag) ? tag.rendered : null;
  if (verseTag && !verseTagValue && !readings.some((r) => r.citation === verseTag)) {
    notices.push(...unresolvedNotice(verseTag, tag, 'verse_tag'));
  }

  const prompt =
    fills.size === 0
      ? ''
      : [
          "Scripture: the placeholders {{bible:1}}, {{bible:2}}, … stand for Scripture readings and citations. After translation each is replaced with the official text of the target language's Catholic Bible.",
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
