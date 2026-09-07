import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { AudioTextPanel, type AudioTextEditorProps, type AudioTextPanelActions } from './audio-text-panel';
import type { AudioTranscriptView } from '@/domain/audio/audio.types';

/**
 * What someone can do in the Audio text tab, driven through the rendered
 * component with its server actions stubbed. Assertions are on what a person
 * sees and clicks, never on how the component stores it.
 *
 * The SSML box is Monaco in the app, which needs a real browser to mount, so
 * these render the panel with a plain textarea in its place. What that leaves
 * untested is Monaco itself; everything the panel does with what you type is
 * exercised for real.
 */

/** Stands in for Monaco. Everything the panel asks of an editor, and nothing more. */
const textareaEditor = ({ value, onChange, readOnly }: AudioTextEditorProps) => (
  <textarea
    aria-label="Audio text"
    value={value}
    readOnly={readOnly}
    onChange={(event) => onChange?.(event.target.value)}
  />
);

const GENERATED =
  '<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="cs-CZ">' +
  '<voice name="cs-CZ-AntoninNeural">Ahoj</voice></speak>';

function stubActions(transcript: AudioTranscriptView | null, overrides: Partial<AudioTextPanelActions> = {}) {
  const calls = {
    save: [] as string[],
    reset: 0,
    keep: 0,
    regenerate: 0,
    /** What each write claimed was stored, in order. Null means "it was derived". */
    expected: [] as (string | null)[],
  };

  const actions: AudioTextPanelActions = {
    load: async () => transcript,
    save: async (_id, ssml, expected) => {
      calls.save.push(ssml);
      calls.expected.push(expected);
      return { status: 'saved' };
    },
    reset: async (_id, expected) => {
      calls.reset += 1;
      calls.expected.push(expected);
      return { status: 'saved' };
    },
    keep: async () => {
      calls.keep += 1;
    },
    regenerate: async () => {
      calls.regenerate += 1;
      return { status: 'success', audioFileId: 'audio-1' };
    },
    ...overrides,
  };

  return { actions, calls };
}

const editable: AudioTranscriptView = { ssml: GENERATED, state: 'generated', source: 'derived', canEdit: true };
/** A transcript somebody has already hand-edited, which is what a stored override looks like. */
const overridden: AudioTranscriptView = { ...editable, state: 'edited', source: 'override' };

afterEach(() => {
  cleanup();
});

test('a transcript nobody has touched is reported as the generated one', async () => {
  const { actions } = stubActions(editable);
  render(<AudioTextPanel documentVersionId="version-1" actions={actions} editor={textareaEditor} />);

  assert.ok(await screen.findByText('Generated'));
  assert.ok(screen.getByText(/Editing it never changes the document/));
});

// Save stays disabled until something is different, so the button cannot send
// an identical copy and turn a generated transcript into an edited one.
test('saving is offered only once something has changed', async () => {
  const { actions } = stubActions(editable);
  render(<AudioTextPanel documentVersionId="version-1" actions={actions} editor={textareaEditor} />);

  const save = await screen.findByRole('button', { name: /^Save$/ });
  assert.equal((save as HTMLButtonElement).disabled, true);
});

test('save and regenerate stores the transcript and asks for a new recording', async () => {
  const user = userEvent.setup();
  const { actions, calls } = stubActions(editable);
  render(<AudioTextPanel documentVersionId="version-1" actions={actions} editor={textareaEditor} />);

  await user.click(await screen.findByRole('button', { name: /Save & regenerate/ }));

  await waitFor(() => assert.equal(calls.regenerate, 1));
  assert.deepEqual(calls.save, [GENERATED]);
});

test('an edited transcript says so and offers a way back to the generated one', async () => {
  const user = userEvent.setup();
  const { actions, calls } = stubActions(overridden);
  render(<AudioTextPanel documentVersionId="version-1" actions={actions} editor={textareaEditor} />);

  assert.ok(await screen.findByText('Edited'));
  await user.click(screen.getByRole('button', { name: /Reset to generated/ }));
  await user.click(await screen.findByRole('button', { name: /Rebuild the audio text/ }));

  await waitFor(() => assert.equal(calls.reset, 1));
});

// Dropping the override cannot be undone and takes every tuned pronunciation
// with it, so the click that does it is never the first one.
test('rebuilding is asked about first, and saying no changes nothing', async () => {
  const user = userEvent.setup();
  const { actions, calls } = stubActions(overridden);
  render(<AudioTextPanel documentVersionId="version-1" actions={actions} editor={textareaEditor} />);

  await user.click(await screen.findByRole('button', { name: /Reset to generated/ }));
  assert.equal(calls.reset, 0);

  await user.click(await screen.findByRole('button', { name: /Keep the edited version/ }));

  await waitFor(() => assert.equal(screen.queryByRole('button', { name: /Rebuild the audio text/ }), null));
  assert.equal(calls.reset, 0);
});

test('a generated transcript has nothing to reset', async () => {
  const { actions } = stubActions(editable);
  render(<AudioTextPanel documentVersionId="version-1" actions={actions} editor={textareaEditor} />);

  await screen.findByText('Generated');
  assert.equal(screen.queryByRole('button', { name: /Reset to generated/ }), null);
});

test('a transcript the translation has moved past asks which one to keep', async () => {
  const user = userEvent.setup();
  const { actions, calls } = stubActions({ ...overridden, state: 'edited_outdated' });
  render(<AudioTextPanel documentVersionId="version-1" actions={actions} editor={textareaEditor} />);

  assert.ok(await screen.findByText(/The translation changed since this audio text was edited/));
  // And says what happens meanwhile, because the prompt blocks nothing.
  assert.ok(screen.getByText(/Your version is still what gets generated/));

  await user.click(screen.getByRole('button', { name: /Keep mine/ }));
  await waitFor(() => assert.equal(calls.keep, 1));
});

// "Keep mine" is about the override the server holds. Reloading the box from it
// would throw away whatever is being typed, which is the opposite of the label.
test('keeping your version leaves what you are typing alone', async () => {
  const user = userEvent.setup();
  const { actions } = stubActions({ ...overridden, state: 'edited_outdated' });
  render(<AudioTextPanel documentVersionId="version-1" actions={actions} editor={textareaEditor} />);

  const box = (await screen.findByLabelText('Audio text')) as HTMLTextAreaElement;
  await user.clear(box);
  await user.type(box, '<speak>Nazdar</speak>');
  await user.click(screen.getByRole('button', { name: /Keep mine/ }));

  await waitFor(() => assert.equal(box.value, '<speak>Nazdar</speak>'));
  // And it is still unsaved, so Save is still on offer.
  assert.equal((screen.getByRole('button', { name: /^Save$/ }) as HTMLButtonElement).disabled, false);
});

test('what the transcript becomes is reported to whoever is showing the badge', async () => {
  const user = userEvent.setup();
  const states: string[] = [];
  const { actions } = stubActions(overridden);
  render(
    <AudioTextPanel
      documentVersionId="version-1"
      actions={actions}
      editor={textareaEditor}
      onStateChange={(state) => states.push(state)}
    />,
  );

  await screen.findByText('Edited');
  await waitFor(() => assert.deepEqual(states, ['edited']));

  // And again after a save, because the badge is elsewhere and cannot see this.
  await user.click(screen.getByRole('button', { name: /Save & regenerate/ }));
  await waitFor(() => assert.deepEqual(states, ['edited', 'edited']));
});

test('unsaved edits are announced, so leaving the tab can be interrupted', async () => {
  const user = userEvent.setup();
  const dirtiness: boolean[] = [];
  const { actions } = stubActions(editable);
  render(
    <AudioTextPanel
      documentVersionId="version-1"
      actions={actions}
      editor={textareaEditor}
      onDirtyChange={(dirty) => dirtiness.push(dirty)}
    />,
  );

  const box = await screen.findByLabelText('Audio text');
  await user.type(box, 'x');

  await waitFor(() => assert.equal(dirtiness.at(-1), true));
});

test('rebuilding from the document is the other answer to that question', async () => {
  const user = userEvent.setup();
  const { actions, calls } = stubActions({ ...overridden, state: 'edited_outdated' });
  render(<AudioTextPanel documentVersionId="version-1" actions={actions} editor={textareaEditor} />);

  await screen.findByText(/The translation changed since this audio text was edited/);
  await user.click(screen.getByRole('button', { name: /Rebuild from document/ }));
  await user.click(await screen.findByRole('button', { name: /Rebuild the audio text/ }));

  await waitFor(() => assert.equal(calls.reset, 1));
});

// ─── Two people, one transcript ──────────────────────────────
//
// There is one override per version and no history of it, so a write that
// lands on top of somebody else's is gone for good. Every write says what it
// believes is stored and is refused when that is no longer true.

test('a write says which stored version it is replacing', async () => {
  const user = userEvent.setup();
  const { actions, calls } = stubActions(overridden);
  render(<AudioTextPanel documentVersionId="version-1" actions={actions} editor={textareaEditor} />);

  await user.click(await screen.findByRole('button', { name: /Save & regenerate/ }));

  await waitFor(() => assert.deepEqual(calls.expected, [GENERATED]));
});

// Nothing is stored yet, so the write may only land while that is still true.
test('a write against a derived transcript claims no stored version', async () => {
  const user = userEvent.setup();
  const { actions, calls } = stubActions(editable);
  render(<AudioTextPanel documentVersionId="version-1" actions={actions} editor={textareaEditor} />);

  await user.click(await screen.findByRole('button', { name: /Save & regenerate/ }));

  await waitFor(() => assert.deepEqual(calls.expected, [null]));
});

const THEIRS = '<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="cs-CZ">Jejich verze.</speak>';

/** Stubs a save that is refused once, then accepted, the way a real race resolves. */
function conflictingActions() {
  const { actions, calls } = stubActions(overridden);
  let refused = false;
  return {
    calls,
    actions: {
      ...actions,
      save: async (id: string, ssml: string, expected: string | null) => {
        if (!refused) {
          refused = true;
          calls.expected.push(expected);
          return { status: 'conflict' as const, current: { ...overridden, ssml: THEIRS } };
        }
        return actions.save(id, ssml, expected);
      },
    },
  };
}

test('a refused save keeps what you typed and says what happened', async () => {
  const user = userEvent.setup();
  const { actions, calls } = conflictingActions();
  render(<AudioTextPanel documentVersionId="version-1" actions={actions} editor={textareaEditor} />);

  const box = (await screen.findByLabelText('Audio text')) as HTMLTextAreaElement;
  await user.clear(box);
  await user.type(box, '<speak>Moje verze.</speak>');
  await user.click(screen.getByRole('button', { name: /^Save$/ }));

  assert.ok(await screen.findByText(/Somebody else saved a different audio text/));
  // Refused, so nothing was stored, and what was typed is still there to store.
  assert.equal(calls.save.length, 0);
  assert.equal(box.value, '<speak>Moje verze.</speak>');
});

test('saving over theirs is a second write that says so', async () => {
  const user = userEvent.setup();
  const { actions, calls } = conflictingActions();
  render(<AudioTextPanel documentVersionId="version-1" actions={actions} editor={textareaEditor} />);

  const box = await screen.findByLabelText('Audio text');
  await user.clear(box);
  await user.type(box, '<speak>Moje verze.</speak>');
  await user.click(screen.getByRole('button', { name: /^Save$/ }));

  await screen.findByText(/Somebody else saved a different audio text/);
  await user.click(screen.getByRole('button', { name: /Save mine anyway/ }));

  // The first write claimed the version this tab loaded; the second claims
  // theirs, which is what is actually stored now.
  await waitFor(() => assert.deepEqual(calls.save, ['<speak>Moje verze.</speak>']));
  assert.deepEqual(calls.expected, [GENERATED, THEIRS]);
});

test('taking their version asks first, because it costs you yours', async () => {
  const user = userEvent.setup();
  const { actions } = conflictingActions();
  render(<AudioTextPanel documentVersionId="version-1" actions={actions} editor={textareaEditor} />);

  const box = (await screen.findByLabelText('Audio text')) as HTMLTextAreaElement;
  await user.clear(box);
  await user.type(box, '<speak>Moje verze.</speak>');
  await user.click(screen.getByRole('button', { name: /^Save$/ }));

  await screen.findByText(/Somebody else saved a different audio text/);
  await user.click(screen.getByRole('button', { name: /^Show theirs$/ }));
  // Asked, not done: what was typed is still in the box.
  assert.ok(await screen.findByText(/Replace what you have typed with theirs\?/));
  assert.equal(box.value, '<speak>Moje verze.</speak>');

  await user.click(screen.getByRole('button', { name: /^Use theirs$/ }));

  await waitFor(() => assert.equal(box.value, THEIRS));
});

// A reset that lands on an override somebody else wrote in the meantime is the
// worse half of this: there would be nothing left to recover it from.
test('a refused reset does not drop what somebody else stored', async () => {
  const user = userEvent.setup();
  let attempted = 0;
  const { actions } = stubActions(overridden, {
    reset: async () => {
      attempted += 1;
      return { status: 'conflict', current: { ...overridden, ssml: THEIRS } };
    },
  });
  render(<AudioTextPanel documentVersionId="version-1" actions={actions} editor={textareaEditor} />);

  await user.click(await screen.findByRole('button', { name: /Reset to generated/ }));
  await user.click(await screen.findByRole('button', { name: /Rebuild the audio text/ }));

  assert.ok(await screen.findByText(/Somebody else saved a different audio text/));
  assert.equal(attempted, 1);
  // Theirs is what the box offers to show, so it is still there to be read.
  assert.ok(screen.getByRole('button', { name: /^Show theirs$/ }));
});

test('someone without permission reads it and is told why', async () => {
  const { actions } = stubActions({
    ssml: GENERATED,
    state: 'generated',
    source: 'derived',
    canEdit: false,
    readOnlyReason: 'You are not assigned to Czech. Ask an admin to add the language to your profile.',
  });
  render(<AudioTextPanel documentVersionId="version-1" actions={actions} editor={textareaEditor} />);

  assert.ok(await screen.findByText(/You are not assigned to Czech/));
  assert.equal(screen.queryByRole('button', { name: /^Save$/ }), null);
  assert.equal(screen.queryByRole('button', { name: /Save & regenerate/ }), null);
  assert.equal(screen.queryByRole('button', { name: /Reset to generated/ }), null);
});

test('broken SSML is flagged with its line, and saving stays available', async () => {
  const user = userEvent.setup();
  const { actions, calls } = stubActions({
    ...editable,
    state: 'edited',
    ssml: '<speak>\n  <prosody rate="0.8">Ahoj\n</speak>',
  });
  render(<AudioTextPanel documentVersionId="version-1" actions={actions} editor={textareaEditor} />);

  assert.ok(await screen.findByText(/is never closed/));
  assert.ok(screen.getByText('Line 2:'));

  // Warned, not stopped: a rule the validator has not heard of must not cost
  // someone the feature.
  await user.click(screen.getByRole('button', { name: /Save & regenerate/ }));
  await waitFor(() => assert.equal(calls.save.length, 1));
});

test('a reader who cannot edit is not shown validation warnings', async () => {
  const { actions } = stubActions({
    ssml: '<speak>\n  <prosody rate="0.8">Ahoj\n</speak>',
    state: 'edited',
    source: 'override',
    canEdit: false,
    readOnlyReason: 'You cannot edit this document, so its audio text is read-only.',
  });
  render(<AudioTextPanel documentVersionId="version-1" actions={actions} editor={textareaEditor} />);

  await screen.findByText(/read-only/);
  assert.equal(screen.queryByText(/is never closed/), null);
});

test('a document that no longer gets audio says so instead of showing an empty box', async () => {
  const { actions } = stubActions(null);
  render(<AudioTextPanel documentVersionId="version-1" actions={actions} editor={textareaEditor} />);

  assert.ok(await screen.findByText(/no longer gets audio/));
});

test('a failure to load is reported rather than shown as an empty transcript', async () => {
  const { actions } = stubActions(editable, {
    load: async () => {
      throw new Error('Could not reach the server');
    },
  });
  render(<AudioTextPanel documentVersionId="version-1" actions={actions} editor={textareaEditor} />);

  assert.ok(await screen.findByText('Could not reach the server'));
});

test('what you type is what gets saved, and the document is never touched', async () => {
  const user = userEvent.setup();
  const { actions, calls } = stubActions(editable);
  render(<AudioTextPanel documentVersionId="version-1" actions={actions} editor={textareaEditor} />);

  const box = await screen.findByLabelText('Audio text');
  await user.clear(box);
  await user.type(box, '<speak>Nazdar</speak>');
  await user.click(screen.getByRole('button', { name: /^Save$/ }));

  await waitFor(() => assert.deepEqual(calls.save, ['<speak>Nazdar</speak>']));
  assert.equal(calls.regenerate, 0);
});

test('typing something broken warns as you go, without disabling Save', async () => {
  const user = userEvent.setup();
  const { actions } = stubActions(editable);
  render(<AudioTextPanel documentVersionId="version-1" actions={actions} editor={textareaEditor} />);

  const box = await screen.findByLabelText('Audio text');
  await user.clear(box);
  await user.type(box, '<speak>Petr & Pavel</speak>');

  assert.ok(await screen.findByText(/A bare & has to be written as &amp;/));
  assert.equal((screen.getByRole('button', { name: /^Save$/ }) as HTMLButtonElement).disabled, false);
});

test('the box is not writable for someone who may only read it', async () => {
  const { actions } = stubActions({ ...editable, canEdit: false, readOnlyReason: 'Read-only for you.' });
  render(<AudioTextPanel documentVersionId="version-1" actions={actions} editor={textareaEditor} />);

  const box = (await screen.findByLabelText('Audio text')) as HTMLTextAreaElement;
  assert.equal(box.readOnly, true);
});

test('Format indents what is in the box, and goes quiet once there is nothing to indent', async () => {
  const user = userEvent.setup();
  const { actions } = stubActions(editable);
  render(<AudioTextPanel documentVersionId="version-1" actions={actions} editor={textareaEditor} />);

  const format = await screen.findByRole('button', { name: /^Format$/ });
  await user.click(format);

  const box = (await screen.findByLabelText('Audio text')) as HTMLTextAreaElement;
  assert.equal(
    box.value,
    '<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="cs-CZ">\n' +
      '  <voice name="cs-CZ-AntoninNeural">Ahoj</voice>\n</speak>',
  );
  await waitFor(() => assert.equal((format as HTMLButtonElement).disabled, true));
});

test('formatting counts as a change, so it can be saved', async () => {
  const user = userEvent.setup();
  const { actions, calls } = stubActions(editable);
  render(<AudioTextPanel documentVersionId="version-1" actions={actions} editor={textareaEditor} />);

  await user.click(await screen.findByRole('button', { name: /^Format$/ }));
  await user.click(screen.getByRole('button', { name: /^Save$/ }));

  await waitFor(() => assert.equal(calls.save.length, 1));
  assert.ok(calls.save[0].includes('\n  <voice'));
});

test('someone who may only read the audio text is not offered Format', async () => {
  const { actions } = stubActions({ ...editable, canEdit: false, readOnlyReason: 'Read-only for you.' });
  render(<AudioTextPanel documentVersionId="version-1" actions={actions} editor={textareaEditor} />);

  await screen.findByLabelText('Audio text');
  assert.equal(screen.queryByRole('button', { name: /^Format$/ }), null);
});
