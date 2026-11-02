import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { extractTextAtRange } from '@/lib/text-range';
import { deployProblems, locateQuote, parseTranslationWithNotes } from './ai-workflow.rules';

describe('parseTranslationWithNotes', () => {
  it('reads the translation and its notes', () => {
    const parsed = parseTranslationWithNotes(
      JSON.stringify({
        translation: '# Den 1\n\nText.',
        notes: [{ quote: 'Den 1', comment: 'Day or Dawn?', suggestion: 'Úsvit 1' }],
      }),
    );
    assert.equal(parsed.translation, '# Den 1\n\nText.');
    assert.deepEqual(parsed.notes, [{ quote: 'Den 1', comment: 'Day or Dawn?', suggestion: 'Úsvit 1' }]);
  });

  it('treats a blank suggestion as none', () => {
    const parsed = parseTranslationWithNotes(
      JSON.stringify({ translation: 'x', notes: [{ quote: 'x', comment: 'unsure', suggestion: ' ' }] }),
    );
    assert.equal(parsed.notes[0].suggestion, null);
  });

  it('drops malformed notes but keeps the translation', () => {
    const parsed = parseTranslationWithNotes(
      JSON.stringify({ translation: 'x', notes: [{ quote: 1 }, null, { quote: 'x', comment: '' }, 'text'] }),
    );
    assert.deepEqual(parsed.notes, []);
  });

  it('accepts a reply with no notes at all', () => {
    assert.deepEqual(parseTranslationWithNotes('{"translation":"x"}').notes, []);
  });

  it('refuses a reply that is not JSON or has no translation, so the step is retried', () => {
    assert.throws(() => parseTranslationWithNotes('# Den 1'), /not valid JSON/);
    assert.throws(() => parseTranslationWithNotes('{"notes":[]}'), /no translation/);
    assert.throws(() => parseTranslationWithNotes('{"translation":"   "}'), /no translation/);
  });
});

describe('locateQuote', () => {
  const content = '---\ntitle: Den\n---\n\n# Den 1\n\nModli se. Modli se znovu.';

  it('finds a quote on one line, in the coordinates a suggestion stores', () => {
    const range = locateQuote(content, 'Modli se znovu');
    assert.ok(range);
    assert.equal(extractTextAtRange(content, range), 'Modli se znovu');
    assert.equal(range.startLine, 7);
  });

  it('finds a quote across lines', () => {
    const range = locateQuote(content, '# Den 1\n\nModli');
    assert.ok(range);
    assert.equal(extractTextAtRange(content, range), '# Den 1\n\nModli');
  });

  it('takes the first of two equal phrases', () => {
    const range = locateQuote(content, 'Modli se');
    assert.deepEqual(range, { startLine: 7, startColumn: 1, endLine: 7, endColumn: 9 });
  });

  it('returns null for words that are not there, or no words', () => {
    assert.equal(locateQuote(content, 'Pray'), null);
    assert.equal(locateQuote(content, '  '), null);
  });
});

describe('deployProblems', () => {
  it('passes a clean Markdown document', () => {
    assert.deepEqual(deployProblems({ content: '---\ntitle: Den\n---\n\nText.', filename: '1.md' }), []);
  });

  it('refuses an empty document', () => {
    assert.equal(deployProblems({ content: '  \n', filename: '1.md' }).length, 1);
  });

  it('refuses frontmatter that does not parse', () => {
    const problems = deployProblems({ content: '---\ntitle: "Den\n---\n\nText.', filename: '1.md' });
    assert.match(problems[0].message, /frontmatter does not parse/);
  });

  it('refuses a YAML file that does not parse', () => {
    const problems = deployProblems({ content: 'a: [1, 2\nb: 3', filename: 'disciplines.yml' });
    assert.match(problems[0].message, /YAML does not parse/);
  });

  it('passes a YAML file that parses', () => {
    assert.deepEqual(deployProblems({ content: 'a:\n  - 1\nb: text', filename: 'disciplines.yaml' }), []);
  });
});
