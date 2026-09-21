import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { syntaxTree } from '@codemirror/language';
import { EditorState } from '@codemirror/state';
import { parseMarkdown } from '@/lib/markdown';
import { markdownSupport } from './cm-markdown';

/** The node types the editor finds in a document. */
function editorReads(doc: string): Set<string> {
  const names = new Set<string>();
  syntaxTree(EditorState.create({ doc, extensions: markdownSupport })).iterate({
    enter: (node) => {
      names.add(node.name);
    },
  });
  return names;
}

describe('the markdown the editor reads', () => {
  // The editor highlights, and the toolbar toggles, what the parser finds. If
  // the parser and the preview disagree, a translator sees markup in the
  // editor that the page shows as plain text, or the other way round.
  const constructs: { name: string; doc: string; node: string; html: RegExp }[] = [
    { name: 'a table', doc: '| a | b |\n| - | - |\n| 1 | 2 |', node: 'Table', html: /<table>/ },
    { name: 'strikethrough', doc: 'the ~~old~~ price', node: 'Strikethrough', html: /<del>old<\/del>/ },
    { name: 'single-tilde strikethrough', doc: 'the ~old~ price', node: 'Strikethrough', html: /<del>old<\/del>/ },
    { name: 'a task list', doc: '- [x] done', node: 'Task', html: /type="checkbox"/ },
    { name: 'a bare link', doc: 'see https://exodus90.com', node: 'URL', html: /<a href="https:\/\/exodus90.com"/ },
  ];

  for (const { name, doc, node, html } of constructs) {
    it(`reads ${name}, as the preview renders one`, () => {
      assert.match(parseMarkdown(doc), html);
      assert.ok(editorReads(doc).has(node), `no ${node} in ${JSON.stringify(doc)}`);
    });
  }

  it('strikes through with tildes only where the preview does', () => {
    // One tilde closes only one tilde, and one beside a space opens nothing.
    for (const doc of ['a ~x~~ b', 'a ~~x~ b', 'a ~ x~ b', '~~~x~~~', 'about ~5 minutes']) {
      assert.doesNotMatch(parseMarkdown(doc), /<del>/, doc);
      assert.ok(!editorReads(doc).has('Strikethrough'), `Strikethrough in ${JSON.stringify(doc)}`);
    }
  });

  it('does not read syntax the preview leaves as text', () => {
    for (const [doc, node] of [
      ['a^2^', 'Superscript'],
      [':smile:', 'Emoji'],
    ]) {
      assert.equal(parseMarkdown(doc).trim(), `<p>${doc}</p>`);
      assert.ok(!editorReads(doc).has(node), `${node} in ${JSON.stringify(doc)}`);
    }
    // The page strikes `~x~` through; it is never a subscript.
    assert.ok(!editorReads('H~2~O').has('Subscript'));
  });
});
