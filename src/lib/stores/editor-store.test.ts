import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DocumentStatus } from '@/generated/prisma/enums';
import { createEditorStore, type EditorStoreConfig, type EditorStoreDeps } from './editor-store';

/** A promise the test settles by hand, for holding a request in flight. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

type Call = { fn: string; args: unknown[] };

/** Lets every queued microtask run, so a write queued behind a promise chain has gone out. */
const settle = () => new Promise<void>((resolve) => setImmediate(resolve));

const VERSION = { id: 'version-1', content: 'first draft', status: DocumentStatus.IN_PROGRESS, version: 1 };

const CONFIG: EditorStoreConfig = {
  documentId: 'doc-1',
  documentTitle: 'Day 1',
  sourceLanguageName: 'English',
  originalFilename: '1.md',
  targetLanguageId: 'lang-sk',
  targetVersion: VERSION,
  sourceContent: 'The call came early.',
  initialSuggestions: [],
  translationProjectId: 'project-1',
  audioTextVersionId: null,
};

/**
 * Deps that record every call and answer with something plausible. A test
 * overrides the one or two it cares about.
 */
function fakeDeps(overrides: Partial<EditorStoreDeps> = {}) {
  const calls: Call[] = [];
  const toasts: Call[] = [];
  const events: Call[] = [];
  const record =
    <T>(fn: string, result: (...args: any[]) => T) =>
    (...args: any[]) => {
      calls.push({ fn, args });
      return result(...args);
    };
  const deps = {
    assignDocumentVersion: record('assignDocumentVersion', async () => ({ ...VERSION, content: '' })),
    updateDocumentVersion: record('updateDocumentVersion', async (id: string, input: { content: string }) => ({
      ...VERSION,
      id,
      content: input.content,
      version: 2,
    })),
    submitForReview: record('submitForReview', async () => ({})),
    assignReviewerToVersion: record('assignReviewerToVersion', async () => ({})),
    assignTranslatorToVersion: record('assignTranslatorToVersion', async () => ({})),
    applySuggestion: record('applySuggestion', async () => ({ ...VERSION, content: 'applied text', version: 3 })),
    createSuggestion: record('createSuggestion', async () => ({})),
    createSuggestionReply: record('createSuggestionReply', async () => ({})),
    dismissSuggestion: record('dismissSuggestion', async () => ({})),
    getSuggestionsByDocumentVersion: record('getSuggestionsByDocumentVersion', async () => []),
    reopenSuggestion: record('reopenSuggestion', async () => ({ updatedVersion: null })),
    getProjectReviewers: record('getProjectReviewers', async () => []),
    listTranslationProjectMembers: record('listTranslationProjectMembers', async () => []),
    deleteDocument: record('deleteDocument', async () => ({})),
    translateDocument: record('translateDocument', async () => ({ translatedContent: 'AI draft' })),
    getAudioTranscriptState: record('getAudioTranscriptState', async () => 'generated' as const),
    notify: {
      success: (message: string) => toasts.push({ fn: 'success', args: [message] }),
      error: (message: string) => toasts.push({ fn: 'error', args: [message] }),
      warning: (message: string) => toasts.push({ fn: 'warning', args: [message] }),
    },
    capture: (event: string, properties?: unknown) => events.push({ fn: event, args: [properties] }),
    ...overrides,
  } as unknown as EditorStoreDeps;
  return { deps, calls, toasts, events };
}

function calledFns(calls: Call[]) {
  return calls.map((call) => call.fn);
}

describe('dirty tracking', () => {
  it('starts clean on the version it was given', () => {
    const store = createEditorStore(CONFIG, fakeDeps().deps);
    assert.equal(store.getState().isDirty(), false);
    assert.equal(store.getState().saveStatus(), 'saved');
  });

  it('is dirty once the text differs from the saved copy, and clean again when it matches', () => {
    const store = createEditorStore(CONFIG, fakeDeps().deps);
    store.getState().setContent('first draft, revised');
    assert.equal(store.getState().isDirty(), true);
    assert.equal(store.getState().saveStatus(), 'unsaved');
    store.getState().setContent('first draft');
    assert.equal(store.getState().isDirty(), false);
  });
});

describe('saveContent', () => {
  it('sends nothing when there is nothing new to write', async () => {
    const { deps, calls, toasts } = fakeDeps();
    const store = createEditorStore(CONFIG, deps);
    await store.getState().saveContent();
    assert.deepEqual(calls, []);
    assert.deepEqual(toasts, []);
  });

  it('writes the text, marks it saved and records when', async () => {
    const { deps, calls } = fakeDeps();
    const store = createEditorStore(CONFIG, deps);
    store.getState().setContent('second draft');
    await store.getState().saveContent();
    assert.deepEqual(calls, [{ fn: 'updateDocumentVersion', args: ['version-1', { content: 'second draft' }] }]);
    assert.equal(store.getState().savedContent, 'second draft');
    assert.equal(store.getState().isDirty(), false);
    assert.ok(store.getState().lastSavedAt instanceof Date);
    assert.equal(store.getState().targetVersion.version, 2);
  });

  it('reports a manual save to analytics and an autosave not at all', async () => {
    const { deps, events } = fakeDeps();
    const store = createEditorStore(CONFIG, deps);
    store.getState().setContent('auto');
    await store.getState().saveContent('auto');
    assert.deepEqual(calledFns(events), []);
    store.getState().setContent('manual');
    await store.getState().saveContent('manual');
    assert.deepEqual(calledFns(events), ['translation_saved']);
  });

  it('reads as saving while the write is in flight', async () => {
    const write = deferred<unknown>();
    const { deps } = fakeDeps({
      updateDocumentVersion: (() => write.promise) as unknown as EditorStoreDeps['updateDocumentVersion'],
    });
    const store = createEditorStore(CONFIG, deps);
    store.getState().setContent('slow');
    const saving = store.getState().saveContent();
    await settle();
    assert.equal(store.getState().saveStatus(), 'saving');
    write.resolve({ ...VERSION, content: 'slow' });
    await saving;
    assert.equal(store.getState().saveStatus(), 'saved');
  });

  it('queues a second write behind the first instead of racing it', async () => {
    const first = deferred<unknown>();
    const { deps, calls } = fakeDeps();
    let writes = 0;
    deps.updateDocumentVersion = (async (id: string, input: { content: string }) => {
      calls.push({ fn: 'updateDocumentVersion', args: [id, input] });
      writes += 1;
      if (writes === 1) return first.promise;
      return { ...VERSION, content: input.content, version: 3 };
    }) as unknown as EditorStoreDeps['updateDocumentVersion'];
    const store = createEditorStore(CONFIG, deps);

    store.getState().setContent('one');
    const saveOne = store.getState().saveContent('auto');
    await settle();
    // The first write is in flight with "one". More typing and a manual save
    // arrive while it is out.
    store.getState().setContent('two');
    const saveTwo = store.getState().saveContent('manual');
    await settle();

    // The second write has not gone out: it is waiting for the first.
    assert.equal(calls.length, 1);
    first.resolve({ ...VERSION, content: 'one', version: 2 });
    await Promise.all([saveOne, saveTwo]);

    assert.deepEqual(
      calls.map((call) => (call.args[1] as { content: string }).content),
      ['one', 'two'],
    );
    assert.equal(store.getState().savedContent, 'two');
  });

  it('skips a queued write whose text the write before it already persisted', async () => {
    const { deps, calls } = fakeDeps();
    const store = createEditorStore(CONFIG, deps);
    store.getState().setContent('same');
    await Promise.all([store.getState().saveContent('auto'), store.getState().saveContent('manual')]);
    assert.equal(calls.length, 1);
  });

  it('tells the reader when the write fails, stops saving, and rethrows for the caller', async () => {
    const { deps, toasts } = fakeDeps({
      updateDocumentVersion: (async () => {
        throw new Error('Forbidden');
      }) as EditorStoreDeps['updateDocumentVersion'],
    });
    const store = createEditorStore(CONFIG, deps);
    store.getState().setContent('doomed');
    await assert.rejects(store.getState().saveContent(), /Forbidden/);
    assert.deepEqual(toasts, [{ fn: 'error', args: ['Forbidden'] }]);
    assert.equal(store.getState().saveStatus(), 'unsaved');
  });

  it('lets a write queued behind a failed one still go out', async () => {
    const { deps, calls } = fakeDeps();
    let writes = 0;
    deps.updateDocumentVersion = (async (id: string, input: { content: string }) => {
      calls.push({ fn: 'updateDocumentVersion', args: [id, input] });
      writes += 1;
      if (writes === 1) throw new Error('first fails');
      return { ...VERSION, content: input.content, version: 2 };
    }) as unknown as EditorStoreDeps['updateDocumentVersion'];
    const store = createEditorStore(CONFIG, deps);

    store.getState().setContent('one');
    const failed = store.getState().saveContent().catch(() => 'failed');
    store.getState().setContent('two');
    const second = store.getState().saveContent();
    assert.equal(await failed, 'failed');
    await second;
    assert.equal(calls.length, 2);
    assert.equal(store.getState().savedContent, 'two');
  });
});

describe('startTranslation', () => {
  it('sends one assign for a double click', async () => {
    const assign = deferred<unknown>();
    const { deps, calls } = fakeDeps();
    deps.assignDocumentVersion = (async (input: unknown) => {
      calls.push({ fn: 'assignDocumentVersion', args: [input] });
      return assign.promise;
    }) as unknown as EditorStoreDeps['assignDocumentVersion'];
    const store = createEditorStore({ ...CONFIG, targetVersion: null }, deps);

    const first = store.getState().startTranslation();
    const second = store.getState().startTranslation();
    assign.resolve({ ...VERSION, content: '' });
    await Promise.all([first, second]);

    assert.equal(calls.length, 1);
    assert.equal(store.getState().targetVersion.id, 'version-1');
  });

  it('refuses without a target language and says so', async () => {
    const { deps, calls, toasts } = fakeDeps();
    const store = createEditorStore({ ...CONFIG, targetVersion: null, targetLanguageId: '' }, deps);
    await store.getState().startTranslation();
    assert.deepEqual(calls, []);
    assert.equal(toasts[0]?.fn, 'warning');
  });
});

describe('translateWithAi', () => {
  it('writes unsaved edits before asking, so the model revises what the reader has', async () => {
    const { deps, calls } = fakeDeps();
    const store = createEditorStore(CONFIG, deps);
    store.getState().setContent('typed but not saved');
    await store.getState().translateWithAi();
    assert.deepEqual(calledFns(calls), ['updateDocumentVersion', 'translateDocument']);
    const request = calls[1].args[0] as { currentTranslation?: string };
    assert.equal(request.currentTranslation, 'typed but not saved');
    assert.equal(store.getState().content, 'AI draft');
  });

  it('keeps what was typed while the model was working instead of replacing it', async () => {
    const model = deferred<{ translatedContent: string }>();
    const { deps, toasts } = fakeDeps({
      translateDocument: (() => model.promise) as unknown as EditorStoreDeps['translateDocument'],
    });
    const store = createEditorStore(CONFIG, deps);

    const drafting = store.getState().translateWithAi();
    await settle();
    store.getState().setContent('first draft, kept typing');
    model.resolve({ translatedContent: 'AI draft' });
    await drafting;

    assert.equal(store.getState().content, 'first draft, kept typing');
    assert.equal(toasts.at(-1)?.fn, 'warning');
    assert.equal(store.getState().isLoading('aiTranslate'), false);
  });

  it('does not ask the model when the edits it would replace could not be saved', async () => {
    const { deps, calls } = fakeDeps({
      updateDocumentVersion: (async () => {
        throw new Error('offline');
      }) as EditorStoreDeps['updateDocumentVersion'],
    });
    const store = createEditorStore(CONFIG, deps);
    store.getState().setContent('unsaved');
    await store.getState().translateWithAi();
    assert.equal(calls.some((call) => call.fn === 'translateDocument'), false);
    assert.equal(store.getState().content, 'unsaved');
  });
});

describe('applySuggestion', () => {
  it('takes the server copy as both the text and the saved text, then reloads the threads', async () => {
    const { deps, calls } = fakeDeps();
    const store = createEditorStore(CONFIG, deps);
    await store.getState().applySuggestion('suggestion-1');
    assert.deepEqual(calledFns(calls), ['applySuggestion', 'getSuggestionsByDocumentVersion']);
    assert.equal(store.getState().content, 'applied text');
    assert.equal(store.getState().savedContent, 'applied text');
    assert.equal(store.getState().isDirty(), false);
  });

  it('saves unsaved edits first, so the suggestion lands on text that includes them', async () => {
    const { deps, calls } = fakeDeps();
    const store = createEditorStore(CONFIG, deps);
    store.getState().setContent('edited');
    await store.getState().applySuggestion('suggestion-1');
    assert.deepEqual(calledFns(calls), ['updateDocumentVersion', 'applySuggestion', 'getSuggestionsByDocumentVersion']);
  });
});

describe('submitForReview', () => {
  it('moves the version to review and closes the dialog', async () => {
    const { deps, calls } = fakeDeps();
    const store = createEditorStore(CONFIG, deps);
    await store.getState().openReviewDialog();
    assert.equal(store.getState().dialog.type, 'submitReview');
    await store.getState().submitForReview('reviewer-1');
    assert.deepEqual(calls.at(-1), { fn: 'submitForReview', args: [{ versionId: 'version-1', reviewerId: 'reviewer-1' }] });
    assert.equal(store.getState().targetVersion.status, DocumentStatus.PENDING_REVIEW);
    assert.equal(store.getState().dialog.type, 'closed');
  });
});

describe('suggestions', () => {
  it('normalises dates the server sends as Date objects to ISO strings', () => {
    const createdAt = new Date('2026-09-26T10:00:00Z');
    const { deps } = fakeDeps();
    const store = createEditorStore(
      { ...CONFIG, initialSuggestions: [{ id: 's1', createdAt, replies: [{ id: 'r1', createdAt }] }] },
      deps,
    );
    const [suggestion] = store.getState().suggestions;
    assert.equal(suggestion.createdAt, '2026-09-26T10:00:00.000Z');
    assert.equal(suggestion.replies?.[0].createdAt, '2026-09-26T10:00:00.000Z');
  });
});

describe('loadAudioTranscriptState', () => {
  it('asks once however many cards ask', async () => {
    const { deps, calls } = fakeDeps();
    const store = createEditorStore(CONFIG, deps);
    await Promise.all([
      store.getState().loadAudioTranscriptState('version-1'),
      store.getState().loadAudioTranscriptState('version-1'),
    ]);
    assert.equal(calls.length, 1);
    assert.equal(store.getState().audioTranscriptState, 'generated');
  });

  it('falls back to generated when the request fails, rather than interrupting anyone', async () => {
    const { deps, toasts } = fakeDeps({
      getAudioTranscriptState: (async () => {
        throw new Error('down');
      }) as EditorStoreDeps['getAudioTranscriptState'],
    });
    const store = createEditorStore(CONFIG, deps);
    await store.getState().loadAudioTranscriptState('version-1');
    assert.equal(store.getState().audioTranscriptState, 'generated');
    assert.deepEqual(toasts, []);
  });
});
