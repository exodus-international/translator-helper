import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateInvitationToken, type InvitationForValidation } from './invitation.validation';

// ─── Test fixtures ───────────────────────────────────────────

function createInvitation(overrides: Partial<InvitationForValidation> = {}): InvitationForValidation {
  return {
    status: 'ACTIVE',
    expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24), // 24h from now
    usedCount: 0,
    maxUses: null, // unlimited
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────

describe('validateInvitationToken', () => {
  it('returns valid for a fresh unlimited invitation', () => {
    const result = validateInvitationToken(createInvitation());
    assert.deepStrictEqual(result, { valid: true });
  });

  it('returns valid for an unlimited invitation with many uses', () => {
    const result = validateInvitationToken(createInvitation({ usedCount: 9999 }));
    assert.deepStrictEqual(result, { valid: true });
  });

  it('returns valid for a fresh single-use invitation', () => {
    const result = validateInvitationToken(createInvitation({ maxUses: 1 }));
    assert.deepStrictEqual(result, { valid: true });
  });

  it('returns valid for a fresh multi-use invitation', () => {
    const result = validateInvitationToken(createInvitation({ maxUses: 10 }));
    assert.deepStrictEqual(result, { valid: true });
  });

  it('returns valid for a partially used multi-use invitation', () => {
    const result = validateInvitationToken(createInvitation({ maxUses: 5, usedCount: 3 }));
    assert.deepStrictEqual(result, { valid: true });
  });

  it('returns invalid when invitation is null', () => {
    const result = validateInvitationToken(null);
    assert.deepStrictEqual(result, { valid: false, reason: 'Invitation not found' });
  });

  it('returns invalid when invitation is revoked', () => {
    const result = validateInvitationToken(createInvitation({ status: 'REVOKED' }));
    assert.deepStrictEqual(result, { valid: false, reason: 'Invitation has been revoked' });
  });

  it('returns invalid when invitation has expired', () => {
    const result = validateInvitationToken(createInvitation({
      expiresAt: new Date(Date.now() - 1000), // 1s ago
    }));
    assert.deepStrictEqual(result, { valid: false, reason: 'Invitation has expired' });
  });

  it('returns invalid when single-use invitation is exhausted', () => {
    const result = validateInvitationToken(createInvitation({ maxUses: 1, usedCount: 1 }));
    assert.deepStrictEqual(result, { valid: false, reason: 'Invitation has already been used' });
  });

  it('returns invalid when multi-use invitation is fully used', () => {
    const result = validateInvitationToken(createInvitation({ maxUses: 3, usedCount: 3 }));
    assert.deepStrictEqual(result, { valid: false, reason: 'Invitation has already been used' });
  });

  it('checks revoked before expired', () => {
    const result = validateInvitationToken(createInvitation({
      status: 'REVOKED',
      expiresAt: new Date(Date.now() - 1000),
    }));
    assert.deepStrictEqual(result, { valid: false, reason: 'Invitation has been revoked' });
  });

  it('checks expired before used', () => {
    const result = validateInvitationToken(createInvitation({
      maxUses: 1,
      expiresAt: new Date(Date.now() - 1000),
      usedCount: 1,
    }));
    assert.deepStrictEqual(result, { valid: false, reason: 'Invitation has expired' });
  });
});
