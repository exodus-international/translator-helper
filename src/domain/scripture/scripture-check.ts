import type { PassageResult, PassageStatus } from '@/domain/bible/bible.types';
import {
  citationKey,
  diffWords,
  findQuotedText,
  formatInlineQuote,
  formatReading,
  sameText,
  similarity,
  type Citation,
  type DiffPart,
  type QuotedText,
} from './citations';

/**
 * The Scripture check: every citation in a translation, what the target Bible
 * calls it and says there, and how the translation's quoted text compares.
 * Pure, so the panel and its tests share one reading of the rules.
 *
 * A citation in English notation is RSV-CE numbering by convention, so its
 * target form is safe to write in. One already in the target's notation may
 * use either numbering: it is trusted when the source cites a passage the
 * target renders exactly so, and otherwise flagged for a person rather than
 * renumbered -- a silently wrong verse is worse than a flagged one.
 */

/** Statuses meaning the match is not a Bible reference at all ("At 5:30"). */
export const NOT_A_REFERENCE: ReadonlySet<PassageStatus> = new Set(['unparseable', 'unknown_book']);

export const isResolved = (r: PassageResult | undefined): r is PassageResult & { rendered: string } =>
  !!r && (r.status === 'ok' || r.status === 'partial') && !!r.rendered;

/** The resolver's statuses in a translator's words. */
export const STATUS_LABEL: Record<PassageStatus, string> = {
  ok: 'Found',
  partial: 'Partly found',
  unparseable: 'Not a reference',
  unknown_book: 'Unknown book',
  unknown_language: 'No Bible for this language',
  book_not_in_translation: 'Book not in this Bible',
  versification_unmapped: 'Numbering not mapped yet',
  out_of_range: 'Verse out of range',
};

export type NotationState =
  /** Written as the target Bible writes it. */
  | 'official'
  /** English notation with a target form to use instead. */
  | 'fixable'
  /** Target notation, but the RSV-CE reading of its numbers renders differently. */
  | 'check-numbering'
  /** The Bible could not supply it (out of range, not mapped, …). */
  | 'unresolved';

export interface QuoteCheck extends QuotedText {
  similarity: number;
  /** The quotation is the official text, word for word. */
  matches: boolean;
  /** From the quotation to the official text; empty when it matches. */
  diff: DiffPart[];
  /** What replaces the quotation's range to make it official. */
  replacement: string;
}

export interface CheckItem {
  id: string;
  citation: Citation;
  /** 1-based line of the citation. */
  line: number;
  status: PassageStatus;
  rendered?: string;
  verses: string[];
  officialText?: string;
  notes: string[];
  notation: NotationState;
  quote: QuoteCheck | null;
}

export interface CheckInput {
  text: string;
  citations: Citation[];
  /** Resolver results in the target language, by citation text. */
  results: ReadonlyMap<string, PassageResult>;
  /** The source's resolved citations, by `citationKey` of their target rendering. */
  sourceRendered?: ReadonlyMap<string, PassageResult>;
}

/** The chapter and verses of a citation, without its book: "Matej 4,19" and "Mt 4,19" are both "4,19". */
const numbersOf = (citation: string) => citationKey(citation).replace(/^\d?\p{L}+/u, '');

/**
 * Read with RSV-CE numbering, a target-notation citation came back with the
 * numbers it was written with, so only its book name differs: whichever
 * numbering the translator meant, the verses are the same.
 */
const sameNumbers = (written: string, rendered: string | undefined) =>
  Boolean(rendered) && numbersOf(written) === numbersOf(rendered!);

export function buildCheckItems({ text, citations, results, sourceRendered }: CheckInput): CheckItem[] {
  const items: CheckItem[] = [];
  let line = 1;
  let counted = 0;
  for (const citation of citations) {
    for (let i = counted; i < citation.from; i++) if (text.charCodeAt(i) === 10) line++;
    counted = citation.from;

    const own = results.get(citation.text);
    const key = citationKey(citation.text);
    const fromSource = citation.notation === 'target' ? sourceRendered?.get(key) : undefined;
    const passage = fromSource ?? own;
    if (!passage || (!fromSource && NOT_A_REFERENCE.has(passage.status))) continue;

    let notation: NotationState;
    if (!isResolved(passage)) notation = 'unresolved';
    else if (fromSource || citationKey(passage.rendered) === key) notation = 'official';
    else if (citation.notation === 'english' || sameNumbers(citation.text, passage.rendered)) notation = 'fixable';
    else notation = 'check-numbering';

    const verses = isResolved(passage) ? (passage.verses ?? []).map((v) => v.text) : [];
    const officialText = verses.length ? verses.join(' ') : passage.text;
    items.push({
      id: `${citation.from}:${citation.text}`,
      citation,
      line,
      status: passage.status,
      rendered: passage.rendered,
      verses,
      officialText,
      notes: passage.notes ?? [],
      notation,
      // Under an uncertain numbering the official text may be the wrong verses,
      // so it is shown but never offered as a replacement.
      quote: verses.length && notation !== 'check-numbering' ? checkQuote(text, citation, verses) : null,
    });
  }
  return items;
}

function checkQuote(text: string, citation: Citation, verses: string[]): QuoteCheck | null {
  const quote = findQuotedText(text, citation);
  if (!quote) return null;
  const official = verses.map((v) => v.replace(/\s+/g, ' ').trim()).join(' ');
  const matches = sameText(quote.plain, official);
  return {
    ...quote,
    similarity: similarity(quote.plain, official),
    matches,
    diff: matches ? [] : diffWords(quote.plain, official),
    replacement: quote.kind === 'reading' ? formatReading(verses, quote.linePerVerse) : formatInlineQuote(verses),
  };
}

export interface Edit {
  from: number;
  to: number;
  insert: string;
  /** The text the edit expects to replace, to re-find it if the document moved. */
  expected: string;
}

export const notationEdit = (item: CheckItem): Edit | null =>
  item.rendered && item.notation !== 'official' && item.notation !== 'unresolved'
    ? { from: item.citation.from, to: item.citation.to, insert: item.rendered, expected: item.citation.raw }
    : null;

export const quoteEdit = (item: CheckItem): Edit | null =>
  item.quote && !item.quote.matches
    ? { from: item.quote.from, to: item.quote.to, insert: item.quote.replacement, expected: item.quote.raw }
    : null;

/** Every notation that is safe to fix unasked: English citations only. */
export const fixAllNotationEdits = (items: CheckItem[]): Edit[] =>
  items.flatMap((item) => (item.notation === 'fixable' ? [notationEdit(item)!] : []));

/** Whether an item asks for anything. */
export const needsAttention = (item: CheckItem) =>
  item.notation !== 'official' || (item.quote !== null && !item.quote.matches);

export interface SourceOnly {
  ref: string;
  rendered: string;
}

/**
 * Passages the source cites that the translation cites nowhere, neither as the
 * target writes them nor as the source does.
 */
export function sourceOnlyCitations(source: ReadonlyMap<string, PassageResult>, items: CheckItem[]): SourceOnly[] {
  const present = new Set<string>();
  for (const item of items) {
    present.add(citationKey(item.citation.text));
    if (item.rendered) present.add(citationKey(item.rendered));
  }
  const out: SourceOnly[] = [];
  const seen = new Set<string>();
  for (const [ref, result] of source) {
    if (!isResolved(result)) continue;
    const key = citationKey(result.rendered);
    if (seen.has(key) || present.has(key) || present.has(citationKey(ref))) continue;
    seen.add(key);
    out.push({ ref, rendered: result.rendered });
  }
  return out;
}
