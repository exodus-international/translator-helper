import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { clearDraft, contentHash, draftKey, readDraft, writeDraft, type DraftStorage } from './editor-draft';

function memoryStorage(): DraftStorage & { items: Map<string, string> } {
  const items = new Map<string, string>();
  return {
    items,
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => void items.set(key, value),
    removeItem: (key) => void items.delete(key),
  };
}

const brokenStorage: DraftStorage = {
  getItem: () => {
    throw new Error('SecurityError');
  },
  setItem: () => {
    throw new Error('QuotaExceededError');
  },
  removeItem: () => {
    throw new Error('SecurityError');
  },
};

describe('editor drafts', () => {
  it('keeps unsaved text and offers it back for the same version', () => {
    const storage = memoryStorage();
    writeDraft(storage, 'v1', { content: 'typed', savedContent: 'saved' }, new Date('2026-10-06T10:00:00Z'));
    assert.deepEqual(JSON.parse(storage.items.get(draftKey('v1'))!), {
      content: 'typed',
      baseHash: contentHash('saved'),
      savedAt: '2026-10-06T10:00:00.000Z',
    });
    assert.deepEqual(readDraft(storage, 'v1', 'saved'), { content: 'typed', baseChanged: false });
    assert.equal(readDraft(storage, 'v2', 'saved'), null);
  });

  it('says when the saved text moved on since the draft was typed', () => {
    const storage = memoryStorage();
    writeDraft(storage, 'v1', { content: 'typed', savedContent: 'saved' });
    assert.deepEqual(readDraft(storage, 'v1', 'edited elsewhere'), { content: 'typed', baseChanged: true });
  });

  it('offers nothing the server already has, or cannot read', () => {
    const storage = memoryStorage();
    writeDraft(storage, 'v1', { content: 'typed', savedContent: 'saved' });
    assert.equal(readDraft(storage, 'v1', 'typed'), null);
    storage.items.set(draftKey('v2'), '{not json');
    assert.equal(readDraft(storage, 'v2', 'saved'), null);
    storage.items.set(draftKey('v3'), JSON.stringify({ content: 42 }));
    assert.equal(readDraft(storage, 'v3', 'saved'), null);
  });

  it('forgets a cleared draft', () => {
    const storage = memoryStorage();
    writeDraft(storage, 'v1', { content: 'typed', savedContent: 'saved' });
    clearDraft(storage, 'v1');
    assert.equal(readDraft(storage, 'v1', 'saved'), null);
  });

  it('treats missing or failing storage as no draft', () => {
    assert.doesNotThrow(() => writeDraft(brokenStorage, 'v1', { content: 'typed', savedContent: 'saved' }));
    assert.doesNotThrow(() => clearDraft(brokenStorage, 'v1'));
    assert.equal(readDraft(brokenStorage, 'v1', 'saved'), null);
    assert.equal(readDraft(null, 'v1', 'saved'), null);
  });
});
