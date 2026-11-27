import type { Edit } from '@/domain/scripture/scripture-check';
import { entryLabel } from '@/domain/standard-translation/entry-label';
import type { StandardCheckItem } from '@/domain/standard-translation/standard-translation.check';
import type { StandardTranslationMatch } from '@/domain/standard-translation/standard-translation.repository';

/** A row of the document panel's standard translations card. */
export type StandardRowItem = StandardCheckItem<StandardTranslationMatch>;

/**
 * How a row names its entry: a term by the wording the translation should
 * use, which is what the translator looks for in the text; anything else by
 * its name, or the start of its source.
 */
export function standardRowName(item: StandardRowItem): string {
  return item.kind === 'term' ? item.entry.targetText : entryLabel(item.entry);
}

/** The line under a row's name: where the entry is, and what is wrong with it if anything is. */
export function standardRowDetail(item: StandardRowItem): string {
  const { firstLine, lastLine } = item.source;
  const lines = firstLine === lastLine ? `line ${firstLine}` : `lines ${firstLine}–${lastLine}`;
  if (item.state === 'missing') return `In the source on ${lines}, not found in the translation`;

  const where = `${lines[0].toUpperCase()}${lines.slice(1)}`;
  if (item.state === 'used') return `${where} · ${item.kind}`;
  const words = item.changedWords;
  // Changed with no word to count: the words are the same, written differently.
  const differs = words === 0 ? 'written differently' : words === 1 ? '1 word differs' : `${words} words differ`;
  return `${where} · ${differs}`;
}

/**
 * Edits applied to a string, back to front so earlier offsets hold, for when
 * there is no editor to make them in. An edit whose text has changed since is
 * skipped.
 */
export function applyToText(text: string, edits: Edit[]): { text: string; applied: number } {
  let out = text;
  let applied = 0;
  for (const edit of [...edits].sort((a, b) => b.from - a.from)) {
    if (out.slice(edit.from, edit.to) !== edit.expected) continue;
    out = out.slice(0, edit.from) + edit.insert + out.slice(edit.to);
    applied++;
  }
  return { text: out, applied };
}
