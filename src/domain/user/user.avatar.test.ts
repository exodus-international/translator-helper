import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  AVATAR_MAX_BYTES,
  avatarRejectionReason,
  isAvatarContentType,
  resolveAvatarObjectKey,
  sniffImageContentType,
} from './user.avatar';

describe('avatarRejectionReason', () => {
  it('accepts the image types the browser is asked to produce', () => {
    for (const contentType of ['image/webp', 'image/jpeg', 'image/png']) {
      assert.equal(avatarRejectionReason({ contentType, size: 1024 }), null);
    }
  });

  it('rejects anything that is not one of those images', () => {
    assert.match(avatarRejectionReason({ contentType: 'image/svg+xml', size: 1024 })!, /JPEG, PNG or WebP/);
    assert.match(avatarRejectionReason({ contentType: 'application/pdf', size: 1024 })!, /JPEG, PNG or WebP/);
    assert.match(avatarRejectionReason({ contentType: '', size: 1024 })!, /JPEG, PNG or WebP/);
  });

  it('rejects an empty file', () => {
    assert.match(avatarRejectionReason({ contentType: 'image/webp', size: 0 })!, /empty/);
  });

  it('rejects a file over the size limit but allows one exactly at it', () => {
    assert.equal(avatarRejectionReason({ contentType: 'image/webp', size: AVATAR_MAX_BYTES }), null);
    assert.match(
      avatarRejectionReason({ contentType: 'image/webp', size: AVATAR_MAX_BYTES + 1 })!,
      /smaller than 2 MB/,
    );
  });
});

describe('isAvatarContentType', () => {
  it('narrows only the supported types', () => {
    assert.equal(isAvatarContentType('image/png'), true);
    assert.equal(isAvatarContentType('image/gif'), false);
  });
});

describe('resolveAvatarObjectKey', () => {
  it('nests the picture under the user and names it by token and format', () => {
    assert.equal(
      resolveAvatarObjectKey({ userId: 'user-1', contentType: 'image/webp', token: 'abc123' }),
      'avatars/user-1/abc123.webp',
    );
    assert.equal(
      resolveAvatarObjectKey({ userId: 'user-1', contentType: 'image/jpeg', token: 'abc123' }),
      'avatars/user-1/abc123.jpg',
    );
  });

  it('gives each upload its own key so caches cannot serve the old picture', () => {
    const first = resolveAvatarObjectKey({ userId: 'user-1', contentType: 'image/webp', token: 'one' });
    const second = resolveAvatarObjectKey({ userId: 'user-1', contentType: 'image/webp', token: 'two' });
    assert.notEqual(first, second);
  });
});

describe('sniffImageContentType', () => {
  const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01]);
  const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
  const webp = Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]);

  it('reads the format from the bytes', () => {
    assert.equal(sniffImageContentType(png), 'image/png');
    assert.equal(sniffImageContentType(jpeg), 'image/jpeg');
    assert.equal(sniffImageContentType(webp), 'image/webp');
  });

  it('returns null for anything that is not one of those images', () => {
    assert.equal(sniffImageContentType(Uint8Array.from([0x3c, 0x21, 0x44, 0x4f])), null); // "<!DO"
    assert.equal(sniffImageContentType(Uint8Array.from([])), null);
    // RIFF container that is not WebP (a WAV file)
    const wav = Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45]);
    assert.equal(sniffImageContentType(wav), null);
  });
});
