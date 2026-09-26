import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { hasBearerSecret } from './bearer';

const SECRET = 'sweep-secret-2f9a';

describe('hasBearerSecret', () => {
  it('accepts the secret behind a Bearer prefix', () => {
    assert.equal(hasBearerSecret(`Bearer ${SECRET}`, SECRET), true);
  });

  it('accepts the prefix in any case, as HTTP auth schemes are', () => {
    assert.equal(hasBearerSecret(`bearer ${SECRET}`, SECRET), true);
  });

  it('refuses a missing header', () => {
    assert.equal(hasBearerSecret(null, SECRET), false);
  });

  it('refuses an empty header', () => {
    assert.equal(hasBearerSecret('', SECRET), false);
  });

  it('refuses a different secret of the same length', () => {
    assert.equal(hasBearerSecret('Bearer sweep-secret-2f9b', SECRET), false);
  });

  it('refuses a prefix of the secret without throwing on the length mismatch', () => {
    assert.equal(hasBearerSecret('Bearer sweep-secret', SECRET), false);
  });

  it('refuses the secret carried by another scheme', () => {
    assert.equal(hasBearerSecret(`Basic ${SECRET}`, SECRET), false);
  });
});
