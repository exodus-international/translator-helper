import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { clampToViewport, initialFloatingPoint } from './floating-window-placement';

const viewport = { width: 1280, height: 800 };
const size = { width: 384, height: 240 };
const pane = { left: 300, top: 100, right: 900 };

describe('initialFloatingPoint', () => {
  it('opens inside the top-right of its pane', () => {
    assert.deepEqual(initialFloatingPoint(pane, size, viewport), { x: 500, y: 116 });
  });

  it('stays on screen when the pane reaches the window edge', () => {
    assert.deepEqual(initialFloatingPoint({ ...pane, left: 600, right: 1280 }, size, viewport), {
      x: viewport.width - 16 - size.width,
      y: 116,
    });
  });

  it('stays inside a pane narrower than the window', () => {
    assert.deepEqual(initialFloatingPoint({ ...pane, right: 500 }, size, viewport), { x: 316, y: 116 });
  });

  it('pins a window bigger than the screen to the margin', () => {
    assert.deepEqual(initialFloatingPoint(pane, { width: 2000, height: 2000 }, viewport), { x: 8, y: 8 });
  });
});

describe('clampToViewport', () => {
  it('leaves a window that is already inside alone', () => {
    assert.deepEqual(clampToViewport({ x: 400, y: 300 }, size, viewport), { x: 400, y: 300 });
  });

  it('pulls a window back by its far edge, not by its origin', () => {
    assert.deepEqual(clampToViewport({ x: 5000, y: 5000 }, size, viewport), {
      x: viewport.width - 8 - size.width,
      y: viewport.height - 8 - size.height,
    });
  });

  it('stops a window dragged past the top and left edges', () => {
    assert.deepEqual(clampToViewport({ x: -400, y: -300 }, size, viewport), { x: 8, y: 8 });
  });
});
