import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef } from 'react';
import { SuggestionFormSurface } from './suggestion-form-surface';
import { SuggestionInlineToolbar } from '../suggestion-inline-toolbar';

/**
 * Phone and desktop get different surfaces for the same form. The width is
 * what `useIsMobile` reads, so each test sets it before rendering.
 */

const desktopWidth = window.innerWidth;
const setWidth = (width: number) => {
  Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: width });
};

afterEach(() => {
  cleanup();
  setWidth(desktopWidth);
});

function Surface({ onRequestClose = () => {} }: { onRequestClose?: () => void }) {
  const containerRef = createRef<HTMLDivElement>();
  return (
    <div ref={containerRef}>
      <SuggestionFormSurface title="Comment" containerRef={containerRef} onRequestClose={onRequestClose}>
        <textarea aria-label="Comment text" />
      </SuggestionFormSurface>
    </div>
  );
}

test('on a phone the form opens as a bottom sheet titled for what is being written', async () => {
  setWidth(390);
  render(<Surface />);
  const dialog = await screen.findByRole('dialog', { name: 'Comment' });
  assert.equal(dialog.getAttribute('data-slot'), 'sheet-content');
  assert.match(dialog.className, /bottom-0/);
  assert.equal(screen.queryByRole('group', { name: 'Move comment window' }), null);
});

test('closing the bottom sheet asks to close the form, so a draft can be kept', async () => {
  setWidth(390);
  let asked = 0;
  render(<Surface onRequestClose={() => asked++} />);
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: 'Close' }));
  assert.equal(asked, 1);
});

test('with the keyboard up the bottom sheet sits above it, inside what is still visible', async () => {
  setWidth(390);
  const listeners = new Set<() => void>();
  const viewport = {
    height: 844,
    offsetTop: 0,
    addEventListener: (_: string, fn: () => void) => listeners.add(fn),
    removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
  };
  const innerHeight = window.innerHeight;
  Object.defineProperty(window, 'innerHeight', { configurable: true, writable: true, value: 844 });
  Object.defineProperty(window, 'visualViewport', { configurable: true, value: viewport });
  try {
    render(<Surface />);
    const dialog = await screen.findByRole('dialog', { name: 'Comment' });
    // The keyboard takes the bottom 300px; iOS leaves innerHeight as it was.
    viewport.height = 544;
    await act(async () => listeners.forEach((fn) => fn()));
    assert.equal(dialog.style.bottom, '300px');
    assert.equal(dialog.style.maxHeight, `${Math.round(544 * 0.85)}px`);
  } finally {
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: undefined });
    Object.defineProperty(window, 'innerHeight', { configurable: true, writable: true, value: innerHeight });
  }
});

test('on a desktop the form stays the draggable floating window', async () => {
  setWidth(1280);
  render(<Surface />);
  const dialog = await screen.findByRole('dialog', { name: 'Comment' });
  assert.notEqual(dialog.getAttribute('data-slot'), 'sheet-content');
  assert.ok(screen.getByRole('group', { name: 'Move comment window' }));
});

test('on a phone the selection actions dock to the bottom as touch-sized buttons', async () => {
  setWidth(390);
  const picked: string[] = [];
  render(
    <SuggestionInlineToolbar
      position={{ left: 10, top: 10, bottom: 20, viewTop: 0, viewBottom: 500 } as never}
      onComment={() => picked.push('comment')}
      onSuggestEdit={() => picked.push('edit')}
    />,
  );
  const bar = await screen.findByRole('toolbar', { name: 'Selection actions' });
  assert.match(bar.className, /bottom-0/);
  const comment = screen.getByRole('button', { name: 'Comment' });
  const edit = screen.getByRole('button', { name: 'Suggest edit' });
  assert.match(comment.className, /h-11/);
  assert.match(edit.className, /h-11/);
  await userEvent.setup().click(edit);
  assert.deepEqual(picked, ['edit']);
});
