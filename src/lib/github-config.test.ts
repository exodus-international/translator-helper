import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { privateKeyFromEnv } from './github-config';

const KEY = '-----BEGIN RSA PRIVATE KEY-----\nabc\n-----END RSA PRIVATE KEY-----\n';

describe('privateKeyFromEnv', () => {
  it('reads GITHUB_APP_PRIVATE_KEY', () => {
    assert.equal(privateKeyFromEnv({ GITHUB_APP_PRIVATE_KEY: KEY }), KEY);
  });

  it('reads GITHUB_PRIVATE_KEY', () => {
    assert.equal(privateKeyFromEnv({ GITHUB_PRIVATE_KEY: KEY }), KEY);
  });

  it('decodes GITHUB_PRIVATE_KEY_BASE64', () => {
    assert.equal(privateKeyFromEnv({ GITHUB_PRIVATE_KEY_BASE64: Buffer.from(KEY).toString('base64') }), KEY);
  });

  it('reads the file GITHUB_PRIVATE_KEY_PATH names', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'github-key-')), 'key.pem');
    writeFileSync(path, KEY);
    assert.equal(privateKeyFromEnv({ GITHUB_PRIVATE_KEY_PATH: path }), KEY);
  });

  it('takes the names in order: base64, app key, key, path', () => {
    const base64 = Buffer.from('from base64').toString('base64');
    assert.equal(
      privateKeyFromEnv({ GITHUB_PRIVATE_KEY_BASE64: base64, GITHUB_APP_PRIVATE_KEY: 'app', GITHUB_PRIVATE_KEY: 'plain' }),
      'from base64',
    );
    assert.equal(privateKeyFromEnv({ GITHUB_APP_PRIVATE_KEY: 'app', GITHUB_PRIVATE_KEY: 'plain' }), 'app');
    assert.equal(privateKeyFromEnv({ GITHUB_PRIVATE_KEY: 'plain', GITHUB_PRIVATE_KEY_PATH: '/nowhere' }), 'plain');
  });

  it('is unset when no name is set, and names a path it cannot read', () => {
    assert.equal(privateKeyFromEnv({}), undefined);
    assert.throws(() => privateKeyFromEnv({ GITHUB_PRIVATE_KEY_PATH: '/nowhere/key.pem' }), /\/nowhere\/key\.pem/);
  });
});
