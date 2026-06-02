import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { validateFilename } from './validate-filename';

describe('validateFilename', () => {
  describe('MEETING', () => {
    it('accepts a single day', () => {
      assert.equal(validateFilename('MEETING', '7.md'), null);
    });

    it('accepts a day range', () => {
      assert.equal(validateFilename('MEETING', '1-6.md'), null);
    });

    it('requires a filename', () => {
      assert.ok(validateFilename('MEETING', ''));
    });

    it('rejects a non-range name', () => {
      assert.ok(validateFilename('MEETING', 'meeting.md'));
    });

    it('rejects a non-md extension', () => {
      assert.ok(validateFilename('MEETING', '1-6.yml'));
    });
  });

  describe('ROOT_FILE', () => {
    it('accepts a markdown file', () => {
      assert.equal(validateFilename('ROOT_FILE', 'description.md'), null);
    });

    it('accepts a yaml file (any extension)', () => {
      assert.equal(validateFilename('ROOT_FILE', 'disciplines.yml'), null);
      assert.equal(validateFilename('ROOT_FILE', 'metadata.yaml'), null);
    });

    it('requires a filename', () => {
      assert.ok(validateFilename('ROOT_FILE', ''));
    });

    it('rejects a path separator', () => {
      assert.ok(validateFilename('ROOT_FILE', 'meetings/1-6.md'));
      assert.ok(validateFilename('ROOT_FILE', 'a\\b.md'));
    });
  });

  describe('DAILY_CONTENT (unchanged)', () => {
    it('accepts a valid daily content name', () => {
      assert.equal(validateFilename('DAILY_CONTENT', '20260201-5.md'), null);
    });

    it('rejects an invalid name', () => {
      assert.ok(validateFilename('DAILY_CONTENT', 'foo.md'));
    });
  });

  describe('unconstrained types', () => {
    it('returns null for DAY regardless of name', () => {
      assert.equal(validateFilename('DAY', 'anything.md'), null);
      assert.equal(validateFilename('DAY', ''), null);
    });
  });
});
