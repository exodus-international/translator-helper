import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';
import { useState } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useAutosave } from './use-autosave';

/**
 * The hook behind every page that saves itself, driven through a one-field
 * form. A short delay keeps the tests quick; the timing itself is real.
 */

afterEach(cleanup);

const DELAY = 50;
const SETTLED = { timeout: 1000 };

function Form({
  initial = 'Slovak',
  save,
  validate,
  delay = DELAY,
}: {
  initial?: string;
  delay?: number;
  save: (value: { name: string }) => Promise<void>;
  validate?: (value: { name: string }) => string | null;
}) {
  const [name, setName] = useState(initial);
  const { status, problem, saveNow } = useAutosave({ value: { name }, save, validate, delay });
  return (
    <>
      <button onClick={saveNow}>Save now</button>
      <input aria-label="Name" value={name} onChange={(event) => setName(event.target.value)} />
      <output aria-label="Status">{status}</output>
      <output aria-label="Problem">{problem ?? ''}</output>
    </>
  );
}

const status = () => screen.getByLabelText('Status').textContent;
const type = (value: string) => fireEvent.change(screen.getByLabelText('Name'), { target: { value } });

test('the value the page loaded with is never saved back', async () => {
  const saved: string[] = [];
  render(<Form save={async (value) => void saved.push(value.name)} />);

  await new Promise((resolve) => setTimeout(resolve, DELAY * 3));

  assert.equal(status(), 'saved');
  assert.deepEqual(saved, []);
});

test('a burst of typing is saved once, after it stops', async () => {
  const saved: string[] = [];
  render(<Form save={async (value) => void saved.push(value.name)} />);

  type('Slov');
  type('Slovenčina');
  assert.equal(status(), 'pending');

  await waitFor(() => assert.deepEqual(saved, ['Slovenčina']), SETTLED);
  await waitFor(() => assert.equal(status(), 'saved'), SETTLED);
});

test('typing back to the saved value is not a change', async () => {
  const saved: string[] = [];
  render(<Form save={async (value) => void saved.push(value.name)} />);

  type('Slovakia');
  type('Slovak');

  await new Promise((resolve) => setTimeout(resolve, DELAY * 3));
  assert.deepEqual(saved, []);
  assert.equal(status(), 'saved');
});

test('an invalid value waits with its reason and is saved once it is valid', async () => {
  const saved: string[] = [];
  render(
    <Form
      save={async (value) => void saved.push(value.name)}
      validate={(value) => (value.name.length < 2 ? 'name: must be at least two characters' : null)}
    />,
  );

  type('S');
  assert.equal(status(), 'invalid');
  assert.equal(screen.getByLabelText('Problem').textContent, 'name: must be at least two characters');
  await new Promise((resolve) => setTimeout(resolve, DELAY * 3));
  assert.deepEqual(saved, []);

  type('Sk');
  await waitFor(() => assert.deepEqual(saved, ['Sk']), SETTLED);
});

test('a failed save says why and tries again on the next change', async () => {
  let fail = true;
  const saved: string[] = [];
  render(
    <Form
      save={async (value) => {
        if (fail) throw new Error('Database is down');
        saved.push(value.name);
      }}
    />,
  );

  type('Slovenčina');
  await waitFor(() => assert.equal(status(), 'failed'), SETTLED);
  assert.equal(screen.getByLabelText('Problem').textContent, 'Database is down');

  fail = false;
  type('Slovenčina!');
  await waitFor(() => assert.deepEqual(saved, ['Slovenčina!']), SETTLED);
});

test('an edit still waiting when the form goes away is saved on the way out', async () => {
  const saved: string[] = [];
  const { unmount } = render(<Form save={async (value) => void saved.push(value.name)} />);

  type('Slovenčina');
  unmount();

  await waitFor(() => assert.deepEqual(saved, ['Slovenčina']), SETTLED);
});

test('save now skips the wait, and the wait comes back for the next edit', async () => {
  const saved: string[] = [];
  render(<Form delay={60_000} save={async (value) => void saved.push(value.name)} />);

  type('Slovenčina');
  fireEvent.click(screen.getByRole('button', { name: 'Save now' }));
  await waitFor(() => assert.deepEqual(saved, ['Slovenčina']), SETTLED);

  type('Slovenčina!');
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.deepEqual(saved, ['Slovenčina']);
  assert.equal(status(), 'pending');
});
