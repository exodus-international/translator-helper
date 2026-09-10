import assert from 'node:assert/strict';
import test from 'node:test';
import { parseMarkdown } from './markdown';

// These pin the marked v15 behaviours the deployed translation app relies on,
// so a marked upgrade that would drift the preview away from production fails
// here instead of silently in the editor. (Sanitizing is a browser-only step in
// MarkdownPreview and is verified against the running app, not here.)

test('renders GFM: headings, tables, strikethrough', () => {
  assert.match(parseMarkdown('# Title'), /<h1[^>]*>Title<\/h1>/);
  assert.match(parseMarkdown('| a | b |\n| - | - |\n| 1 | 2 |'), /<table>/);
  assert.match(parseMarkdown('~~gone~~'), /<del>gone<\/del>/);
});

test('breaks: false — a single newline does not become <br> (matches app defaults)', () => {
  assert.doesNotMatch(parseMarkdown('line one\nline two'), /<br\s*\/?>/);
});

test('renders links and emphasis', () => {
  assert.match(parseMarkdown('[docs](https://example.org)'), /<a href="https:\/\/example\.org">docs<\/a>/);
  assert.match(parseMarkdown('**bold**'), /<strong>bold<\/strong>/);
});

test('empty / nullish content is safe', () => {
  assert.equal(parseMarkdown(''), '');
  assert.equal(parseMarkdown(undefined as unknown as string), '');
});
