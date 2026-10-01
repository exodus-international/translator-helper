import { Decoration, EditorView, ViewPlugin, type DecorationSet, type ViewUpdate } from '@codemirror/view';
import type { EditorState, Range } from '@codemirror/state';

/**
 * YAML frontmatter, drawn as the metadata it is.
 *
 * `@codemirror/lang-markdown` has no frontmatter mode, so the block at the top
 * of every document in this library is parsed as prose -- and because it ends
 * with a `---` line, the last of its lines becomes a setext heading that pulls
 * the whole block into 16.8px bold. Every document then opens with five lines
 * of shouting before any content.
 *
 * This marks the block and its keys instead. Nothing is reparsed: the marks
 * only carry classes, and the theme gives them a font size and weight that
 * override the heading the parser thinks it sees (see `.cm-frontmatter` in
 * cm-theme.ts).
 */
const frontmatterLine = Decoration.line({ class: 'cm-frontmatter' });
const frontmatterKey = Decoration.mark({ class: 'cm-frontmatter-key' });

const OPENING = /^---[ \t]*\r?\n/;
const CLOSING = /^---[ \t]*$/;
const KEY = /^[A-Za-z_][\w-]*:/;

/**
 * How far down to look for the closing `---`.
 *
 * The blocks in this library run to a handful of keys, so anything past this is
 * not frontmatter that someone forgot to close -- and the bound is what keeps
 * the search off the rest of the document, since this runs on every keystroke.
 */
const MAX_FRONTMATTER_LINES = 200;

/** The line the block closes on, or 0 when the document opens no block. */
export function closingLine(doc: EditorState['doc']): number {
  if (!OPENING.test(doc.line(1).text + '\n')) return 0;
  const last = Math.min(doc.lines, MAX_FRONTMATTER_LINES);
  for (let number = 2; number <= last; number++) {
    if (CLOSING.test(doc.line(number).text)) return number;
  }
  return 0;
}

function buildFrontmatter(view: EditorView): DecorationSet {
  const doc = view.state.doc;
  // Only a closed block is frontmatter. An opening `---` on its own is a
  // horizontal rule, or a block someone is still typing, and without this the
  // scan ran to the end of the document and drew every line of it as metadata
  // -- the whole translation greyed out between the first `---` and the second.
  const closing = closingLine(doc);
  if (!closing) return Decoration.none;

  const ranges: Range<Decoration>[] = [];
  for (let number = 1; number <= closing; number++) {
    const line = doc.line(number);
    ranges.push(frontmatterLine.range(line.from));
    if (number === closing) break;
    const key = KEY.exec(line.text);
    if (key) {
      ranges.push(frontmatterKey.range(line.from, line.from + key[0].length - 1));
    }
  }

  return Decoration.set(ranges, true);
}

export const frontmatterDecoration = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = buildFrontmatter(view);
    }

    update(update: ViewUpdate) {
      if (update.docChanged) {
        this.decorations = buildFrontmatter(update.view);
      }
    }
  },
  { decorations: (plugin) => plugin.decorations },
);
