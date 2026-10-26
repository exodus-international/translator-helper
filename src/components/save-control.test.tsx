import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { SaveControl } from './save-control';

/**
 * The save slot shared by every page that saves itself: the translation
 * editor's toolbar and the language settings page.
 */

afterEach(cleanup);

test('saved shows a chip with the time of the last save, and no button', () => {
  render(<SaveControl status="saved" lastSavedAt={new Date(2026, 9, 26, 14, 5)} onSave={() => undefined} />);

  assert.equal(screen.getByTitle('All changes saved at 14:05').textContent, 'Saved');
  assert.equal(screen.queryByRole('button'), null);
});

test('unsaved offers to save now', () => {
  let saves = 0;
  render(<SaveControl status="unsaved" lastSavedAt={null} onSave={() => saves++} />);

  fireEvent.click(screen.getByRole('button', { name: 'Save' }));

  assert.equal(saves, 1);
});

test('saving cannot be clicked again', () => {
  render(<SaveControl status="saving" lastSavedAt={null} onSave={() => undefined} />);
  assert.equal((screen.getByRole('button', { name: 'Saving...' }) as HTMLButtonElement).disabled, true);
});

test('a failed save says so and offers to try again', () => {
  render(<SaveControl status="error" lastSavedAt={null} onSave={() => undefined} />);
  assert.equal(screen.getByRole('button', { name: 'Save failed' }).getAttribute('title'), 'The last save failed — save again');
});

test('a change waiting for autosave shows that it is coming, with no button', () => {
  render(<SaveControl status="pending" lastSavedAt={null} onSave={() => undefined} />);
  assert.ok(screen.getByText('Saving...'));
  assert.equal(screen.queryByRole('button'), null);
});

test('a change that cannot be saved says so, with no button', () => {
  render(<SaveControl status="blocked" lastSavedAt={null} onSave={() => undefined} />);
  assert.ok(screen.getByText('Not saved'));
  assert.equal(screen.queryByRole('button'), null);
});
