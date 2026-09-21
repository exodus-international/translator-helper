/**
 * The bold, italic, struck and link spans around a selection, as the Markdown
 * parser reads them.
 *
 * The formatting toolbar needs to know when a selection sits *inside* one: a
 * translator double-clicks a word in `**a discipline you commit to**`, and the
 * word is bold, but there is no `**` next to it to say so. Pairing markers up
 * by scanning the text gets `**a** b **c**` wrong -- `b` has `**` on both
 * sides and is not bold -- so the parser, which already applies CommonMark's
 * rules for which marker closes which, is asked instead.
 */

import { syntaxTree } from '@codemirror/language';
import type { EditorState } from '@codemirror/state';
import type { InlineSpan } from './formatting';

type SyntaxNode = ReturnType<typeof syntaxTree>['topNode'];

const SPAN_NODES: Record<string, InlineSpan['action']> = {
  StrongEmphasis: 'bold',
  Emphasis: 'italic',
  Strikethrough: 'strikethrough',
  Link: 'link',
};

const MARK_NODES = new Set(['EmphasisMark', 'StrikethroughMark', 'LinkMark']);

/** Where the text of a span is: between its two markers, or a link's brackets. */
function textRange(node: SyntaxNode): { from: number; to: number } | null {
  const marks: SyntaxNode[] = [];
  let destination = false;
  for (let child = node.firstChild; child; child = child.nextSibling) {
    if (MARK_NODES.has(child.name)) marks.push(child);
    if (child.name === 'LinkLabel') destination = true;
  }
  if (marks.length < 2) return null;
  // The parser cannot see whether `[a word]` names a reference defined
  // somewhere, so it calls any bracketed phrase a link. It is one here only
  // with somewhere to go: `(url)` after it, or a `[reference]`.
  if (node.name === 'Link' && marks.length < 4 && !destination) return null;
  // An emphasis has its two markers; a link has `[` and `]` first, then the
  // parentheses or label the text does not include.
  return { from: marks[0].to, to: marks[1].from };
}

/** Every span that holds the whole selection, innermost first. */
export function inlineSpansAround(state: EditorState, from: number, to: number): InlineSpan[] {
  const spans: InlineSpan[] = [];
  for (let node: SyntaxNode | null = syntaxTree(state).resolveInner(from, 1); node; node = node.parent) {
    const action = SPAN_NODES[node.name];
    if (!action || node.from > from || node.to < to) continue;
    const text = textRange(node);
    if (text) spans.push({ action, from: node.from, to: node.to, textFrom: text.from, textTo: text.to });
  }
  return spans;
}
