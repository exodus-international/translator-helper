import { Decoration, EditorView, ViewPlugin, type DecorationSet, type ViewUpdate } from '@codemirror/view';
import type { Range } from '@codemirror/state';

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

function buildFrontmatter(view: EditorView): DecorationSet {
  const doc = view.state.doc;
  const first = doc.line(1);
  if (!OPENING.test(first.text + '\n')) return Decoration.none;

  const ranges: Range<Decoration>[] = [];
  for (let number = 1; number <= doc.lines; number++) {
    const line = doc.line(number);
    if (number > 1 && CLOSING.test(line.text)) {
      ranges.push(frontmatterLine.range(line.from));
      break;
    }
    ranges.push(frontmatterLine.range(line.from));
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
