import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { describe, it } from 'node:test';
import { gravatarHash, gravatarUrl, sha256Hex } from './gravatar';

describe('sha256Hex', () => {
  it('hashes the empty string', () => {
    assert.equal(sha256Hex(''), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });

  it('hashes a short string', () => {
    assert.equal(sha256Hex('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('hashes a string that spans two blocks', () => {
    assert.equal(
      sha256Hex('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq'),
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
    );
  });

  it('hashes non-ASCII by its UTF-8 bytes', () => {
    // Names in this app are full of them, so check against a real SHA-256.
    const expected = createHash('sha256').update('Fr. Tomáš Žižka', 'utf8').digest('hex');
    assert.equal(sha256Hex('Fr. Tomáš Žižka'), expected);
  });
});

describe('gravatarHash', () => {
  it('ignores case and surrounding space, the way Gravatar does', () => {
    assert.equal(gravatarHash('  Person@Example.ORG '), gravatarHash('person@example.org'));
  });
});

describe('gravatarUrl', () => {
  it('asks for a 404 rather than a generated placeholder', () => {
    const url = gravatarUrl('person@example.org', 64);
    assert.ok(url?.startsWith('https://www.gravatar.com/avatar/'));
    assert.ok(url?.endsWith('?s=64&d=404'));
  });

  it('has nowhere to look without an address', () => {
    assert.equal(gravatarUrl(null, 64), null);
    assert.equal(gravatarUrl(undefined, 64), null);
    assert.equal(gravatarUrl('', 64), null);
    assert.equal(gravatarUrl('not-an-address', 64), null);
  });
});
