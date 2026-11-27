import type { LayoutPart } from '@/domain/standard-translation/match-form';

/** How each part of a document's layout is named to a translator, and whether it reads as plural. */
const PHRASES: Record<LayoutPart, { text: string; plural: boolean }> = {
  blockquote: { text: 'blockquote markers', plural: true },
  list: { text: 'list markers', plural: true },
  heading: { text: 'heading markers', plural: true },
  indentation: { text: 'indentation', plural: false },
  emphasis: { text: 'the emphasis around the text', plural: false },
  comment: { text: 'comments such as the pause marker', plural: true },
  'hard-break': { text: 'hard line breaks', plural: true },
};

function joinList(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/**
 * The sentence the add dialog shows when `stripLayout` took something out,
 * so nobody is surprised that the saved text lost its blockquote or italics.
 * Null when nothing was taken out. Parts arrive in `stripLayout`'s order.
 */
export function describeRemovedLayout(parts: LayoutPart[]): string | null {
  if (parts.length === 0) return null;
  const phrases = parts.map((part) => PHRASES[part]);
  const list = joinList(phrases.map((phrase) => phrase.text));
  const verb = phrases.length > 1 || phrases[0].plural ? 'were' : 'was';
  return `${list[0].toUpperCase()}${list.slice(1)} ${verb} left out. Each document keeps its own layout; only the wording is saved.`;
}
