import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createInvitationSchema, registerWithInviteSchema } from './invitation.types';

// ─── createInvitationSchema ─────────────────────────────────

describe('createInvitationSchema', () => {
  it('accepts empty object (all defaults)', () => {
    const result = createInvitationSchema.parse({});
    assert.equal(result.maxUses, null);
    assert.equal(result.expiresAt, undefined);
  });

  it('accepts explicit maxUses', () => {
    const result = createInvitationSchema.parse({ maxUses: 5 });
    assert.equal(result.maxUses, 5);
  });

  it('accepts null maxUses (unlimited)', () => {
    const result = createInvitationSchema.parse({ maxUses: null });
    assert.equal(result.maxUses, null);
  });

  it('accepts expiresAt as date string', () => {
    const result = createInvitationSchema.parse({ expiresAt: '2026-12-31' });
    assert.ok(result.expiresAt instanceof Date);
  });

  it('rejects maxUses of 0', () => {
    assert.throws(() => createInvitationSchema.parse({ maxUses: 0 }));
  });

  it('rejects negative maxUses', () => {
    assert.throws(() => createInvitationSchema.parse({ maxUses: -1 }));
  });

  it('rejects non-integer maxUses', () => {
    assert.throws(() => createInvitationSchema.parse({ maxUses: 1.5 }));
  });
});

// ─── registerWithInviteSchema ───────────────────────────────

describe('registerWithInviteSchema', () => {
  const validInput = {
    token: 'abc-123',
    name: 'Test User',
    email: 'test@example.com',
    password: 'securepassword',
  };

  it('accepts valid input', () => {
    const result = registerWithInviteSchema.parse(validInput);
    assert.equal(result.token, 'abc-123');
    assert.equal(result.email, 'test@example.com');
  });

  it('rejects empty token', () => {
    assert.throws(() => registerWithInviteSchema.parse({ ...validInput, token: '' }));
  });

  it('rejects empty name', () => {
    assert.throws(() => registerWithInviteSchema.parse({ ...validInput, name: '' }));
  });

  it('rejects invalid email', () => {
    assert.throws(() => registerWithInviteSchema.parse({ ...validInput, email: 'not-an-email' }));
  });

  it('rejects password shorter than 8 characters', () => {
    assert.throws(() => registerWithInviteSchema.parse({ ...validInput, password: 'short' }));
  });

  it('accepts password of exactly 8 characters', () => {
    const result = registerWithInviteSchema.parse({ ...validInput, password: '12345678' });
    assert.equal(result.password, '12345678');
  });

  it('rejects missing fields', () => {
    assert.throws(() => registerWithInviteSchema.parse({}));
  });
});
