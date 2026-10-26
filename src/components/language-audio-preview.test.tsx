import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { DEFAULT_PREVIEW_TEXTS } from '@/domain/audio/audio.preview';
import { LanguageAudioPreview, PREVIEW_AUTOSAVE_MS, type LanguageAudioPreviewActions } from './language-audio-preview';

/**
 * The preview box in a language's Audio card, with its server actions
 * stubbed. The autosave waits for real time, so the tests that type give
 * waitFor enough room for one debounce.
 */

afterEach(cleanup);

const SLOVAK = { id: 'lang-sk', code: 'sk', audioPreviewText: null };
const SETTINGS = { audioProvider: 'AZURE_SPEECH', audioVoice: 'sk-SK-LukasNeural', audioRate: '0.85' };
const AFTER_AUTOSAVE = { timeout: PREVIEW_AUTOSAVE_MS + 2000 };

function stubActions() {
  const saved: string[] = [];
  const previewed: Record<string, unknown>[] = [];
  const actions: LanguageAudioPreviewActions = {
    save: async (_id, text) => {
      saved.push(text);
    },
    preview: async (_id, input) => {
      previewed.push(input);
      return { ok: true, audioBase64: 'AAEC', contentType: 'audio/mpeg' };
    },
  };
  return { saved, previewed, actions };
}

const box = () => screen.getByLabelText('Preview text') as HTMLTextAreaElement;

test('the box starts with the built-in sample when the language saved none', () => {
  render(<LanguageAudioPreview language={SLOVAK} settings={SETTINGS} actions={stubActions().actions} />);
  assert.equal(box().value, DEFAULT_PREVIEW_TEXTS.sk);
  assert.equal(screen.getByTitle('All changes saved').textContent, 'Saved');
});

test('the box starts with the sample the language saved', () => {
  render(
    <LanguageAudioPreview
      language={{ ...SLOVAK, audioPreviewText: 'Vlastný text.' }}
      settings={SETTINGS}
      actions={stubActions().actions}
    />,
  );
  assert.equal(box().value, 'Vlastný text.');
});

test('typing saves once, a moment after the typing stops', async () => {
  const { saved, actions } = stubActions();
  render(<LanguageAudioPreview language={SLOVAK} settings={SETTINGS} actions={actions} />);

  fireEvent.change(box(), { target: { value: 'Prvý' } });
  fireEvent.change(box(), { target: { value: 'Prvý pokus.' } });
  assert.ok(screen.getByRole('button', { name: 'Save' }));
  assert.deepEqual(saved, []);

  await waitFor(() => assert.deepEqual(saved, ['Prvý pokus.']), AFTER_AUTOSAVE);
  await waitFor(() => assert.ok(screen.getByTitle(/^All changes saved at/)));
});

test('a failed save says so next to the box', async () => {
  const actions: LanguageAudioPreviewActions = {
    save: async () => {
      throw new Error('Database is down');
    },
    preview: async () => ({ ok: false, error: 'unused' }),
  };
  render(<LanguageAudioPreview language={SLOVAK} settings={SETTINGS} actions={actions} />);

  fireEvent.change(box(), { target: { value: 'Text.' } });

  await waitFor(() => assert.ok(screen.getByRole('button', { name: 'Save failed' })), AFTER_AUTOSAVE);
});

test('preview sends the unsaved settings with the text and plays the result', async () => {
  const { previewed, actions } = stubActions();
  render(<LanguageAudioPreview language={SLOVAK} settings={SETTINGS} actions={actions} />);

  fireEvent.click(screen.getByRole('button', { name: 'Preview' }));

  await waitFor(() => assert.ok(screen.getByLabelText('Preview audio')));
  assert.deepEqual(previewed, [{ ...SETTINGS, text: DEFAULT_PREVIEW_TEXTS.sk }]);
  assert.equal(screen.getByLabelText('Preview audio').getAttribute('src'), 'data:audio/mpeg;base64,AAEC');
});

test('a failed preview shows the provider message', async () => {
  const actions: LanguageAudioPreviewActions = {
    save: async () => undefined,
    preview: async () => ({ ok: false, error: 'Azure preview failed (400): Voice not found' }),
  };
  render(<LanguageAudioPreview language={SLOVAK} settings={SETTINGS} actions={actions} />);

  fireEvent.click(screen.getByRole('button', { name: 'Preview' }));

  await waitFor(() => assert.equal(screen.getByRole('alert').textContent, 'Azure preview failed (400): Voice not found'));
});

test('text over the limit cannot be previewed', () => {
  render(<LanguageAudioPreview language={SLOVAK} settings={SETTINGS} actions={stubActions().actions} />);

  fireEvent.change(box(), { target: { value: 'a'.repeat(501) } });

  assert.equal((screen.getByRole('button', { name: 'Preview' }) as HTMLButtonElement).disabled, true);
});
