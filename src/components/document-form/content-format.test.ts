import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { getContentFormat } from './content-format';

describe('getContentFormat', () => {
  it('treats .yml and .yaml as YAML (case-insensitive)', () => {
    assert.equal(getContentFormat('disciplines.yml'), 'YAML');
    assert.equal(getContentFormat('metadata.yaml'), 'YAML');
    assert.equal(getContentFormat('CONFIG.YML'), 'YAML');
  });

  it('treats markdown and other names as Markdown', () => {
    assert.equal(getContentFormat('description.md'), 'Markdown');
    assert.equal(getContentFormat('1-6.md'), 'Markdown');
    assert.equal(getContentFormat('notes.txt'), 'Markdown');
  });

  it('defaults to Markdown when no filename is set', () => {
    assert.equal(getContentFormat(''), 'Markdown');
  });
});
