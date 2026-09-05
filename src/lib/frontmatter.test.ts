import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseFrontmatter } from './frontmatter';

describe('parseFrontmatter', () => {
  it('returns the text untouched when there is no frontmatter', () => {
    const text = 'just some content';
    assert.deepEqual(parseFrontmatter(text), { data: {}, content: text });
  });

  it('splits frontmatter from content', () => {
    const { data, content } = parseFrontmatter('---\ntitle: Hello\n---\n\nbody text');
    assert.deepEqual(data, { title: 'Hello' });
    assert.equal(content, '\n\nbody text');
  });

  it('handles CRLF line endings', () => {
    const { data, content } = parseFrontmatter('---\r\ntitle: Hello\r\n---\r\nbody');
    assert.deepEqual(data, { title: 'Hello' });
    assert.equal(content, '\r\nbody');
  });

  it('returns empty data for non-object frontmatter', () => {
    const { data, content } = parseFrontmatter('---\n- a\n- b\n---\nbody');
    assert.deepEqual(data, {});
    assert.equal(content, '\nbody');
  });

  it('returns empty data for invalid YAML', () => {
    const { data, content } = parseFrontmatter('---\ntitle: [unclosed\n---\nbody');
    assert.deepEqual(data, {});
    assert.equal(content, '\nbody');
  });

  it('treats an unclosed delimiter as plain content', () => {
    const text = '---\ntitle: never closed';
    assert.deepEqual(parseFrontmatter(text), { data: {}, content: text });
  });
});
