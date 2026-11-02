import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { extractTextAtRange } from '@/lib/text-range';
import { audioTextProblems, deployProblems, locateQuote, parseTranslationWithNotes } from './ai-workflow.rules';

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

  it('finds a quote the model copied with other quote marks and spacing', () => {
    const text = 'Pavel píše:\n„Mzdou hříchu je smrt“ (Římanům 6,23).';
    const range = locateQuote(text, '"Mzdou hříchu je smrt" (Římanům 6,23)');
    assert.ok(range);
    assert.equal(extractTextAtRange(text, range), 'Mzdou hříchu je smrt“ (Římanům 6,23)');
    assert.deepEqual(locateQuote(text, 'Mzdou hříchu je smrt (Římanům 6,23)'), range, 'or with none');

    const wrapped = locateQuote(text, 'píše: „Mzdou');
    assert.ok(wrapped);
    assert.equal(extractTextAtRange(text, wrapped), 'píše:\n„Mzdou');
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

describe('audioTextProblems', () => {
  const derived = '<speak><voice name="cs-CZ-AntoninNeural">Den 1 [ref] <break time="1000ms"/> Text.</voice></speak>';
  const check = (prepared: string, validate = () => [] as { message: string }[]) =>
    audioTextProblems({
      derived,
      prepared,
      validate,
      voiceOf: (ssml) => /name="([^"]+)"/.exec(ssml)?.[1] ?? null,
    });

  it('accepts text with a marker taken out', () => {
    assert.deepEqual(check('<speak><voice name="cs-CZ-AntoninNeural">Den 1 <break time="1000ms"/> Text.</voice></speak>'), []);
  });

  it('refuses a changed voice', () => {
    const problems = check('<speak><voice name="cs-CZ-VlastaNeural">Den 1 <break time="1000ms"/> Text.</voice></speak>');
    assert.match(problems[0].message, /voice/);
  });

  it('refuses a dropped pause', () => {
    const problems = check('<speak><voice name="cs-CZ-AntoninNeural">Den 1 Text.</voice></speak>');
    assert.match(problems[0].message, /pauses/);
  });

  it('passes on what the SSML check finds', () => {
    const problems = check(derived, () => [{ message: 'Unclosed <voice>' }]);
    assert.deepEqual(problems, [{ message: 'Unclosed <voice>' }]);
  });
});
