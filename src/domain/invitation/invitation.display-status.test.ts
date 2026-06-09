import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getInvitationDisplayStatus, type InvitationForDisplayStatus } from './invitation.display-status';

function createInvitation(overrides: Partial<InvitationForDisplayStatus> = {}): InvitationForDisplayStatus {
  return {
    status: 'ACTIVE',
    expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
    usedCount: 0,
    maxUses: null,
    ...overrides,
  };
}

describe('getInvitationDisplayStatus', () => {
  it('returns active for a fresh unlimited invitation', () => {
    assert.equal(getInvitationDisplayStatus(createInvitation()), 'active');
  });

  it('returns active for a partially used multi-use invitation', () => {
    assert.equal(getInvitationDisplayStatus(createInvitation({ maxUses: 5, usedCount: 2 })), 'active');
  });

  it('returns revoked when status is REVOKED', () => {
    assert.equal(getInvitationDisplayStatus(createInvitation({ status: 'REVOKED' })), 'revoked');
  });

  it('returns expired when expiresAt is in the past', () => {
    assert.equal(
      getInvitationDisplayStatus(createInvitation({ expiresAt: new Date(Date.now() - 1000) })),
      'expired',
    );
  });

  it('returns exhausted when usedCount reaches maxUses', () => {
    assert.equal(
      getInvitationDisplayStatus(createInvitation({ maxUses: 3, usedCount: 3 })),
      'exhausted',
    );
  });

  it('returns exhausted when usedCount exceeds maxUses', () => {
    assert.equal(
      getInvitationDisplayStatus(createInvitation({ maxUses: 1, usedCount: 5 })),
      'exhausted',
    );
  });

  it('never returns exhausted for unlimited invitations regardless of usedCount', () => {
    assert.equal(
      getInvitationDisplayStatus(createInvitation({ maxUses: null, usedCount: 9999 })),
      'active',
    );
  });

  // Priority: revoked > expired > exhausted
  it('revoked takes priority over expired', () => {
    assert.equal(
      getInvitationDisplayStatus(createInvitation({
        status: 'REVOKED',
        expiresAt: new Date(Date.now() - 1000),
      })),
      'revoked',
    );
  });

  it('expired takes priority over exhausted', () => {
    assert.equal(
      getInvitationDisplayStatus(createInvitation({
        expiresAt: new Date(Date.now() - 1000),
        maxUses: 1,
        usedCount: 1,
      })),
      'expired',
    );
  });
});
