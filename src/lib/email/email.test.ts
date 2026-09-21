import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveEmailTransport } from './index';
import { classifySmtpError } from './transports/smtp';

describe('resolveEmailTransport', () => {
  const from = { EMAIL_FROM: 'Translation Helper <noreply@example.org>' };

  it('is off without a sender address', () => {
    assert.equal(resolveEmailTransport({ RESEND_API_KEY: 're_x' }), null);
  });

  it('is off when nothing is configured', () => {
    assert.equal(resolveEmailTransport(from), null);
  });

  it('infers the provider from its settings', () => {
    assert.equal(resolveEmailTransport({ ...from, RESEND_API_KEY: 're_x' })?.name, 'resend');
    assert.equal(
      resolveEmailTransport({ ...from, SMTP_HOST: 'localhost', SMTP_PORT: '1025' })?.name,
      'smtp (localhost:1025)',
    );
  });

  it('lets EMAIL_PROVIDER choose when both are set', () => {
    const env = { ...from, RESEND_API_KEY: 're_x', SMTP_HOST: 'smtp.example.org', EMAIL_PROVIDER: 'smtp' };
    assert.equal(resolveEmailTransport(env)?.name, 'smtp (smtp.example.org:587)');
  });

  it('is off when the chosen provider is missing its settings', () => {
    assert.equal(resolveEmailTransport({ ...from, EMAIL_PROVIDER: 'resend' }), null);
    assert.equal(resolveEmailTransport({ ...from, EMAIL_PROVIDER: 'nope' }), null);
  });

  it('offers a console transport for development', () => {
    assert.equal(resolveEmailTransport({ ...from, EMAIL_PROVIDER: 'console' })?.name, 'console');
  });
});

describe('classifySmtpError', () => {
  it('retries a temporary failure', () => {
    assert.deepEqual(classifySmtpError({ responseCode: 451, message: 'try later' }), {
      ok: false,
      error: 'SMTP 451: try later',
      retryable: true,
      rateLimited: false,
    });
  });

  it('gives up on a permanent failure', () => {
    const result = classifySmtpError({ responseCode: 550, message: 'no such user' });
    assert.equal(result.retryable, false);
  });

  it('backs off when throttled', () => {
    const result = classifySmtpError({ responseCode: 421, message: 'too many connections' });
    assert.equal(result.rateLimited, true);
    assert.equal(result.retryable, true);
  });

  it('retries a connection that never got a reply', () => {
    const result = classifySmtpError(Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNECTION' }));
    assert.equal(result.retryable, true);
  });
});
