import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { selectVisibleAnnouncements, type AnnouncementForVisibility } from './announcement.visibility';

// ─── Test fixtures ───────────────────────────────────────────

const NOW = new Date('2026-07-21T12:00:00Z');
const HOUR = 1000 * 60 * 60;

let idCounter = 0;

function createAnnouncement(overrides: Partial<AnnouncementForVisibility> = {}): AnnouncementForVisibility {
  idCounter += 1;
  return {
    id: `announcement-${idCounter}`,
    type: 'BANNER',
    isActive: true,
    expiresAt: null,
    createdAt: new Date(NOW.getTime() - 24 * HOUR),
    ...overrides,
  };
}

const noDismissals = new Set<string>();

// ─── Tests ───────────────────────────────────────────────────

describe('selectVisibleAnnouncements', () => {
  it('returns nothing for an empty list', () => {
    const result = selectVisibleAnnouncements([], noDismissals, NOW);
    assert.deepStrictEqual(result, { banner: null, modal: null });
  });

  it('returns an active banner', () => {
    const banner = createAnnouncement();
    const result = selectVisibleAnnouncements([banner], noDismissals, NOW);
    assert.strictEqual(result.banner, banner);
    assert.strictEqual(result.modal, null);
  });

  it('returns an active modal', () => {
    const modal = createAnnouncement({ type: 'MODAL' });
    const result = selectVisibleAnnouncements([modal], noDismissals, NOW);
    assert.strictEqual(result.banner, null);
    assert.strictEqual(result.modal, modal);
  });

  it('excludes inactive announcements', () => {
    const inactive = createAnnouncement({ isActive: false });
    const result = selectVisibleAnnouncements([inactive], noDismissals, NOW);
    assert.deepStrictEqual(result, { banner: null, modal: null });
  });

  it('excludes expired announcements', () => {
    const expired = createAnnouncement({ expiresAt: new Date(NOW.getTime() - 1) });
    const result = selectVisibleAnnouncements([expired], noDismissals, NOW);
    assert.deepStrictEqual(result, { banner: null, modal: null });
  });

  it('excludes an announcement expiring exactly now', () => {
    const expiringNow = createAnnouncement({ expiresAt: NOW });
    const result = selectVisibleAnnouncements([expiringNow], noDismissals, NOW);
    assert.deepStrictEqual(result, { banner: null, modal: null });
  });

  it('includes an announcement expiring in the future', () => {
    const future = createAnnouncement({ expiresAt: new Date(NOW.getTime() + HOUR) });
    const result = selectVisibleAnnouncements([future], noDismissals, NOW);
    assert.strictEqual(result.banner, future);
  });

  it('includes an announcement with no expiry', () => {
    const noExpiry = createAnnouncement({ expiresAt: null });
    const result = selectVisibleAnnouncements([noExpiry], noDismissals, NOW);
    assert.strictEqual(result.banner, noExpiry);
  });

  it('excludes dismissed announcements', () => {
    const dismissed = createAnnouncement();
    const result = selectVisibleAnnouncements([dismissed], new Set([dismissed.id]), NOW);
    assert.deepStrictEqual(result, { banner: null, modal: null });
  });

  it('picks the newest banner when several are active', () => {
    const older = createAnnouncement({ createdAt: new Date(NOW.getTime() - 48 * HOUR) });
    const newer = createAnnouncement({ createdAt: new Date(NOW.getTime() - 1 * HOUR) });
    const result = selectVisibleAnnouncements([older, newer], noDismissals, NOW);
    assert.strictEqual(result.banner, newer);
  });

  it('reveals the next-newest banner once the newest is dismissed (queue, not stack)', () => {
    const older = createAnnouncement({ createdAt: new Date(NOW.getTime() - 48 * HOUR) });
    const newer = createAnnouncement({ createdAt: new Date(NOW.getTime() - 1 * HOUR) });
    const result = selectVisibleAnnouncements([older, newer], new Set([newer.id]), NOW);
    assert.strictEqual(result.banner, older);
  });

  it('returns one banner and one modal at the same time', () => {
    const banner = createAnnouncement();
    const modal = createAnnouncement({ type: 'MODAL' });
    const result = selectVisibleAnnouncements([banner, modal], noDismissals, NOW);
    assert.strictEqual(result.banner, banner);
    assert.strictEqual(result.modal, modal);
  });

  it('selects newest independently per type', () => {
    const oldBanner = createAnnouncement({ createdAt: new Date(NOW.getTime() - 72 * HOUR) });
    const newModal = createAnnouncement({ type: 'MODAL', createdAt: new Date(NOW.getTime() - 1 * HOUR) });
    const newBanner = createAnnouncement({ createdAt: new Date(NOW.getTime() - 2 * HOUR) });
    const oldModal = createAnnouncement({ type: 'MODAL', createdAt: new Date(NOW.getTime() - 96 * HOUR) });
    const result = selectVisibleAnnouncements([oldBanner, newModal, newBanner, oldModal], noDismissals, NOW);
    assert.strictEqual(result.banner, newBanner);
    assert.strictEqual(result.modal, newModal);
  });

  it('never returns two modals', () => {
    const modalA = createAnnouncement({ type: 'MODAL', createdAt: new Date(NOW.getTime() - 2 * HOUR) });
    const modalB = createAnnouncement({ type: 'MODAL', createdAt: new Date(NOW.getTime() - 1 * HOUR) });
    const result = selectVisibleAnnouncements([modalA, modalB], noDismissals, NOW);
    assert.strictEqual(result.modal, modalB);
    assert.strictEqual(result.banner, null);
  });

  it('combines all rules: dismissed, expired, and inactive are skipped in order', () => {
    const dismissed = createAnnouncement({ createdAt: new Date(NOW.getTime() - 1 * HOUR) });
    const expired = createAnnouncement({
      createdAt: new Date(NOW.getTime() - 2 * HOUR),
      expiresAt: new Date(NOW.getTime() - HOUR),
    });
    const inactive = createAnnouncement({ createdAt: new Date(NOW.getTime() - 3 * HOUR), isActive: false });
    const visible = createAnnouncement({ createdAt: new Date(NOW.getTime() - 4 * HOUR) });
    const result = selectVisibleAnnouncements(
      [dismissed, expired, inactive, visible],
      new Set([dismissed.id]),
      NOW,
    );
    assert.strictEqual(result.banner, visible);
  });
});
