/**
 * Every server action that writes a document version's text checks the edit
 * rule first.
 *
 * `assertCanEditDocumentVersionContent` is what keeps approved and deployed
 * text frozen, so a deploy only ever publishes reviewed text. It only works if
 * every path that writes the text asks it. This reads the source of every
 * `*.actions.ts` file and, for each call that writes version content, checks
 * that the same action called the rule earlier in its body.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

/** The calls that write a version's `content`. */
const CONTENT_WRITERS = new Set(['updateDocumentVersion', 'applySuggestion']);
const GUARD = 'assertCanEditDocumentVersionContent';

const DOMAIN_DIR = path.resolve(__dirname);

function listActionFiles(): string[] {
  const files: string[] = [];
  for (const domain of fs.readdirSync(DOMAIN_DIR, { withFileTypes: true })) {
    if (!domain.isDirectory()) continue;
    for (const name of fs.readdirSync(path.join(DOMAIN_DIR, domain.name))) {
      if (name.endsWith('.actions.ts')) files.push(`${domain.name}/${name}`);
    }
  }
  return files.sort();
}

/** For each exported action that writes content: each write, and whether the guard ran before it. */
function contentWrites(file: string): { action: string; writer: string; guarded: boolean }[] {
  const source = ts.createSourceFile(
    file,
    fs.readFileSync(path.join(DOMAIN_DIR, file), 'utf8'),
    ts.ScriptTarget.Latest,
    true,
  );
  const writes: { action: string; writer: string; guarded: boolean }[] = [];
  for (const statement of source.statements) {
    if (!ts.isFunctionDeclaration(statement) || !statement.name || !statement.body) continue;
    const exported = statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword);
    if (!exported) continue;

    let guardAt = -1;
    const visit = (node: ts.Node) => {
      if (ts.isCallExpression(node)) {
        const callee = node.expression.getText();
        if (callee === GUARD && guardAt < 0) guardAt = node.getStart();
        if (CONTENT_WRITERS.has(callee)) {
          writes.push({
            action: statement.name!.text,
            writer: callee,
            guarded: guardAt >= 0 && guardAt < node.getStart(),
          });
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(statement.body);
  }
  return writes;
}

describe('version content writes', () => {
  const writes = listActionFiles().flatMap((file) => contentWrites(file).map((write) => ({ file, ...write })));

  it('finds the actions that write content', () => {
    const actions = writes.map((write) => write.action).sort();
    assert.deepEqual(actions, ['applySuggestionAction', 'reopenSuggestionAction', 'updateDocumentVersionAction']);
  });

  for (const write of writes) {
    it(`${write.action} checks ${GUARD} before ${write.writer}()`, () => {
      assert.equal(write.guarded, true, `${write.file}: ${write.action} calls ${write.writer}() without ${GUARD} first`);
    });
  }
});
