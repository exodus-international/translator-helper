import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { placeToolbar, type SelectionBox } from './toolbar-placement';

// A pane in the middle of a laptop screen, and a toolbar the size of the
// formatting one. Every number below is in viewport pixels.
const pane = { left: 300, top: 100, right: 900, bottom: 700 };
const window = { width: 1280, height: 800 };
const size = { width: 240, height: 36 };

function selection(overrides: Partial<SelectionBox>): SelectionBox {
  return { left: 400, top: 400, bottom: 420, viewTop: pane.top, viewBottom: pane.bottom, ...overrides };
}

describe('placeToolbar', () => {
  it('sits above the selection, clear of its first line, when there is room', () => {
    const placed = placeToolbar(selection({}), size, pane, window);
    assert.deepEqual(placed, { left: 400, top: 400 - 6 - 36, below: false });
  });

  it('drops below the selection when the pane has no room above it', () => {
    const placed = placeToolbar(selection({ top: 110, bottom: 130 }), size, pane, window);
    assert.deepEqual(placed, { left: 400, top: 130 + 6, below: true });
  });

  it('lands on the selection only when it fills the pane and nothing else fits', () => {
    const placed = placeToolbar(selection({ top: 105, bottom: 695 }), size, pane, window);
    assert.equal(placed?.below, true);
    // Pinned to the pane's bottom inset rather than pushed off it.
    assert.equal(placed?.top, pane.bottom - 8 - size.height);
  });

  it('stays inside the pane on the right when the selection starts near its edge', () => {
    const placed = placeToolbar(selection({ left: 850 }), size, pane, window);
    assert.equal(placed?.left, pane.right - 8 - size.width);
  });

  it('never goes past the pane on the left', () => {
    const placed = placeToolbar(selection({ left: 290 }), size, pane, window);
    assert.equal(placed?.left, pane.left + 8);
  });

  it('is nowhere while the selection is scrolled above the text band', () => {
    assert.equal(placeToolbar(selection({ top: 20, bottom: 90 }), size, pane, window), null);
  });

  it('is nowhere while the selection is scrolled below the text band', () => {
    assert.equal(placeToolbar(selection({ top: 710, bottom: 730 }), size, pane, window), null);
  });

  it('treats a selection that runs off the drawn text as open on that side', () => {
    // Select-all in a long document: no coordinates for the first character.
    const placed = placeToolbar(selection({ top: -Infinity, bottom: 500 }), size, pane, window);
    assert.deepEqual(placed, { left: 400, top: 500 + 6, below: true });
  });

  it('keeps to the window when there is no pane to keep to', () => {
    const placed = placeToolbar(selection({ left: 1270, top: 10, bottom: 30, viewTop: 0, viewBottom: 800 }), size, undefined, window);
    assert.deepEqual(placed, { left: window.width - 8 - size.width, top: 30 + 6, below: true });
  });
});
