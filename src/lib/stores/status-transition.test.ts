import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { useStatusTransitionStore } from './status-transition';

const store = useStatusTransitionStore;

describe('status transition store', () => {
  beforeEach(() => {
    store.setState({ pending: new Set() });
  });

  it('lets the first caller claim a version', () => {
    assert.equal(store.getState().begin('v1'), true);
    assert.equal(store.getState().pending.has('v1'), true);
  });

  it('refuses a second claim while the first is in flight', () => {
    store.getState().begin('v1');
    assert.equal(store.getState().begin('v1'), false);
  });

  it('keeps versions independent, so one in flight does not block another', () => {
    store.getState().begin('v1');
    assert.equal(store.getState().begin('v2'), true);
  });

  it('lets a version be claimed again once released', () => {
    store.getState().begin('v1');
    store.getState().release('v1');
    assert.equal(store.getState().pending.has('v1'), false);
    assert.equal(store.getState().begin('v1'), true);
  });

  it('ignores a release for a version nobody claimed', () => {
    store.getState().begin('v1');
    store.getState().release('v2');
    assert.deepEqual([...store.getState().pending], ['v1']);
  });

  it('replaces the set on every change, so a subscriber sees a new reference', () => {
    const before = store.getState().pending;
    store.getState().begin('v1');
    assert.notEqual(store.getState().pending, before);
  });
});
