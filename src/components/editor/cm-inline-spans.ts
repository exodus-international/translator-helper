/**
 * The bold, italic, struck and link spans around a selection and inside it, as
 * the Markdown parser reads them.
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

/**
 * Every span that holds the whole selection, innermost first, then every one
 * the selection holds -- the ones a wrap round the whole takes the place of.
 */
export function inlineSpansOf(state: EditorState, from: number, to: number): InlineSpan[] {
  const spans: InlineSpan[] = [];
  const add = (node: SyntaxNode) => {
    const action = SPAN_NODES[node.name];
    const text = action && textRange(node);
    if (text) spans.push({ action, from: node.from, to: node.to, textFrom: text.from, textTo: text.to });
  };
  const tree = syntaxTree(state);
  for (let node: SyntaxNode | null = tree.resolveInner(from, 1); node; node = node.parent) {
    if (node.from <= from && to <= node.to) add(node);
  }
  if (from < to) {
    tree.iterate({
      from,
      to,
      enter: (node) => {
        // The selection exactly is one of the spans around it, found above.
        if (from <= node.from && node.to <= to && !(node.from === from && node.to === to)) add(node.node);
      },
    });
  }
  return spans;
}
