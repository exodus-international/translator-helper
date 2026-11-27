import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SuggestionForm } from './suggestion-form';

/**
 * A suggested change opens with the selected words already in the replacement
 * field. Someone who writes the new wording in the comment and saves has
 * proposed the text that is already there, and applying that changes nothing.
 */

afterEach(cleanup);

function renderChange(onSubmit: (data: { comment: string; proposedText?: string }) => void = () => {}) {
  render(
    <SuggestionForm
      type="CHANGE"
      initialProposedText="annak megértésében"
      currentText="annak megértésében"
      onSubmit={onSubmit}
      onCancel={() => {}}
    />,
  );
  return {
    replacement: screen.getByLabelText('Proposed replacement'),
    comment: screen.getByLabelText('Comment (optional)'),
    save: screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement,
  };
}

test('the replacement comes before the comment, so the new wording goes in the first field', () => {
  const { replacement, comment } = renderChange();
  assert.ok(replacement.compareDocumentPosition(comment) & Node.DOCUMENT_POSITION_FOLLOWING);
});

test('a change that only has a comment cannot be saved, and the form says where the new wording goes', async () => {
  const submitted: unknown[] = [];
  const { comment, save } = renderChange((data) => submitted.push(data));
  await userEvent.type(comment, 'annak érdekében, hogy megértsük');
  assert.equal(save.disabled, true);
  assert.ok(screen.getByText('This is the text as it is now. Write the new wording here.'));
  await userEvent.click(save);
  assert.deepEqual(submitted, []);
});

test('a change with new wording saves it as the replacement', async () => {
  const submitted: unknown[] = [];
  const { replacement, save } = renderChange((data) => submitted.push(data));
  await userEvent.clear(replacement);
  await userEvent.type(replacement, 'annak érdekében, hogy megértsük');
  assert.equal(save.disabled, false);
  assert.equal(screen.queryByText('This is the text as it is now. Write the new wording here.'), null);
  await userEvent.click(save);
  assert.deepEqual(submitted, [{ comment: '', proposedText: 'annak érdekében, hogy megértsük' }]);
});

test('a comment has no replacement field and saves as before', async () => {
  const submitted: unknown[] = [];
  render(<SuggestionForm type="COMMENT" onSubmit={(data) => submitted.push(data)} onCancel={() => {}} />);
  assert.equal(screen.queryByLabelText('Proposed replacement'), null);
  await userEvent.type(screen.getByLabelText('Comment'), 'Why this word?');
  await userEvent.click(screen.getByRole('button', { name: 'Save' }));
  assert.deepEqual(submitted, [{ comment: 'Why this word?', proposedText: undefined }]);
});
