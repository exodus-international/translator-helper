import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef, forwardRef, useImperativeHandle } from 'react';
import { SuggestionStatus, SuggestionType } from '@/generated/prisma/enums';
import type { SuggestionWithUser } from '@/domain/suggestion/suggestion.types';
import { EditorProvider } from '@/lib/stores/editor-provider';
import type { EditorStoreDeps } from '@/lib/stores/editor-store';
import type { CodeEditorHandle } from './editor/code-editor';
import { EditorImplementationProvider, type EditorComponent } from './editor/editor-implementation';
import { SourceTranslationViewer, type SourceTranslationViewerHandle } from './source-translation-viewer';

/**
 * What a person can do in the two panes and the panel, pinned before the
 * viewer is taken apart. The editing surface is CodeMirror in the app, which
 * needs a real browser to mount, so these render every pane with a plain
 * textarea in its place: what that leaves untested is CodeMirror itself, and
 * the toolbars that are placed from its measurements. DOMPurify under
 * happy-dom keeps text and drops tags, so a preview is recognised by its
 * text rather than by a heading.
 */

afterEach(cleanup);

/** Stands in for the code editor: the props the viewer drives, and nothing more. */
const textareaEditor: EditorComponent = forwardRef<CodeEditorHandle, Parameters<EditorComponent>[0]>(
  function TextareaEditor({ value, onChange, readOnly, placeholder, ariaLabel }, ref) {
    useImperativeHandle(ref, () => ({ editor: null, view: null, fixAll: () => ({ fixed: 0, remaining: 0 }) }));
    return (
      <textarea
        aria-label={ariaLabel}
        value={value}
        readOnly={readOnly}
        placeholder={placeholder}
        onChange={(event) => onChange?.(event.target.value)}
      />
    );
  },
);

const reviewer = { id: 'user-reviewer', name: 'Ivan Horvat', email: 'reviewer@example.org', image: null };

const openChange: SuggestionWithUser = {
  id: 'thread-1',
  startLine: 1,
  startColumn: 1,
  endLine: 1,
  endColumn: 5,
  type: SuggestionType.CHANGE,
  status: SuggestionStatus.OPEN,
  comment: 'Use the modern word.',
  proposedText: 'poziv',
  originalText: null,
  user: reviewer,
  createdAt: new Date().toISOString(),
  version: 3,
  replies: [],
};

const SOURCE = '# The Call\n\nThe call came early.';
const TRANSLATION = '# Poziv\n\nPoziv je dosao rano.';

function Harness(props: Partial<React.ComponentProps<typeof SourceTranslationViewer>> & { viewerRef?: React.Ref<SourceTranslationViewerHandle> }) {
  const { viewerRef, ...rest } = props;
  return (
    // The Markdown guide dialog inside the viewer reads the editor store, so the
    // store has to exist; nothing here reaches its actions.
    <EditorProvider
      documentId="doc-1"
      documentTitle="Day 1"
      sourceLanguageName="English"
      originalFilename="1.md"
      targetLanguageId="lang-hr"
      targetVersion={null}
      sourceContent={SOURCE}
      initialSuggestions={[]}
      translationProjectId="tp-1"
      audioTextVersionId={null}
      deps={{} as EditorStoreDeps}
    >
      <EditorImplementationProvider editor={textareaEditor}>
        <SourceTranslationViewer
          ref={viewerRef}
          variant="translate"
          sourceContent={SOURCE}
          sourceFormattedContent={SOURCE}
          translationContent={TRANSLATION}
          translationFormattedContent={TRANSLATION}
          {...rest}
        />
      </EditorImplementationProvider>
    </EditorProvider>
  );
}

const sourcePane = () => screen.getByRole('textbox', { name: 'Source text' });
const translationPane = () => screen.getByRole('textbox', { name: 'Translation' });
/** Both panes offer a Preview tab; the source's comes first in the document. */
const previewTabs = async () => screen.findAllByRole('tab', { name: 'Preview' });

test('shows the source read-only beside an editable translation, and reports typing', async () => {
  const typed: string[] = [];
  render(<Harness onTranslationChange={(value) => typed.push(value)} />);
  const user = userEvent.setup();

  assert.equal(sourcePane().hasAttribute('readonly'), true);
  assert.equal(translationPane().hasAttribute('readonly'), false);
  await user.type(translationPane(), '!');
  assert.equal(typed.at(-1), `${TRANSLATION}!`);
});

test('the translation switches between the editor and a preview, and the handle drives the same switch', async () => {
  const ref = createRef<SourceTranslationViewerHandle>();
  render(<Harness viewerRef={ref} />);
  const user = userEvent.setup();

  await user.click((await previewTabs())[1]);
  assert.equal(screen.queryByRole('textbox', { name: 'Translation' }), null);
  assert.ok(await screen.findByText(/Poziv je dosao rano/));

  await user.click(screen.getByRole('tab', { name: 'Edit' }));
  assert.ok(translationPane());

  ref.current?.exitTranslationEditMode();
  await screen.findByText(/Poziv je dosao rano/);
  ref.current?.enterTranslationEditMode();
  assert.ok(await screen.findByRole('textbox', { name: 'Translation' }));
});

test('the source switches between Markdown and a preview', async () => {
  render(<Harness />);
  const user = userEvent.setup();
  await user.click((await previewTabs())[0]);
  assert.equal(screen.queryByRole('textbox', { name: 'Source text' }), null);
  assert.ok(await screen.findByText(/The call came early/));
  await user.click(screen.getByRole('tab', { name: 'Markdown' }));
  assert.ok(sourcePane());
});

test('a document not yet started offers to start it instead of an editor', async () => {
  let started = 0;
  render(<Harness translationStarted={false} onStartTranslation={() => (started += 1)} />);
  const user = userEvent.setup();
  assert.equal(screen.queryByRole('textbox', { name: 'Translation' }), null);
  assert.ok(screen.getByText('No translation yet'));
  await user.click(screen.getByRole('button', { name: 'Start translation' }));
  assert.equal(started, 1);
});

test('the source is edited in place, saved through the host, or cancelled back to what it was', async () => {
  const changes: string[] = [];
  let saves = 0;
  render(
    <Harness canEditSource onSourceChange={(value) => changes.push(value)} onSourceSave={async () => void (saves += 1)} />,
  );
  const user = userEvent.setup();

  await user.click(await screen.findByRole('button', { name: 'Edit' }));
  assert.equal(sourcePane().hasAttribute('readonly'), false);
  await user.type(sourcePane(), ' Again.');
  assert.equal(changes.at(-1), `${SOURCE} Again.`);

  await user.click(screen.getByRole('button', { name: 'Save' }));
  assert.equal(saves, 1);
  assert.ok(await screen.findByRole('button', { name: 'Edit' }));
  assert.equal(sourcePane().hasAttribute('readonly'), true);

  await user.click(screen.getByRole('button', { name: 'Edit' }));
  await user.type(sourcePane(), ' Dropped.');
  await user.click(screen.getByRole('button', { name: 'Cancel' }));
  assert.ok(await screen.findByRole('button', { name: 'Edit' }));
  assert.equal((sourcePane() as HTMLTextAreaElement).value, SOURCE);
});

test('without the right to edit the source, no Edit button is offered', () => {
  render(<Harness />);
  assert.equal(screen.queryByRole('button', { name: 'Edit' }), null);
});

test('in review the translation is read-only, the tab counts open feedback, and Live shows the preview', async () => {
  render(<Harness variant="review" suggestions={[openChange]} canCreateSuggestions currentUserId="user-me" />);
  const user = userEvent.setup();

  assert.equal(translationPane().hasAttribute('readonly'), true);
  const reviewTab = await screen.findByRole('tab', { name: /Review/ });
  assert.ok(within(reviewTab).getByText('1'));

  await user.click(screen.getByRole('tab', { name: 'Live' }));
  assert.equal(screen.queryByRole('textbox', { name: 'Translation' }), null);
  assert.ok(await screen.findByText(/Poziv je dosao rano/));
});

test('the panel lists the feedback and clicking a thread tells the host which one', async () => {
  const clicked: string[] = [];
  render(
    <Harness
      variant="review"
      suggestions={[openChange]}
      canCreateSuggestions
      currentUserId="user-me"
      onSuggestionClick={(suggestion) => clicked.push(suggestion.id)}
    />,
  );
  const user = userEvent.setup();

  const feedback = screen.getByRole('region', { name: 'Feedback' });
  assert.ok(within(feedback).getByRole('heading', { name: 'Feedback (1 open)' }));
  const thread = within(feedback).getByRole('article', { name: 'Feedback from Ivan Horvat' });
  assert.ok(within(thread).getByText('Use the modern word.'));
  await user.click(within(thread).getByText('Use the modern word.'));
  assert.deepEqual(clicked, ['thread-1']);
});

test('a reviewer who may edit enters and leaves edit mode through the handle and the host actions', async () => {
  const ref = createRef<SourceTranslationViewerHandle>();
  render(
    <Harness
      variant="review"
      viewerRef={ref}
      reviewConfig={{
        canEdit: true,
        renderEditActions: ({ exitEditMode }) => (
          <button type="button" onClick={exitEditMode}>
            Done editing
          </button>
        ),
      }}
    />,
  );
  const user = userEvent.setup();

  assert.equal(translationPane().hasAttribute('readonly'), true);
  ref.current?.enterTranslationEditMode();
  const editable = await screen.findByRole('textbox', { name: 'Translation' });
  assert.equal(editable.hasAttribute('readonly'), false);

  await user.click(screen.getByRole('button', { name: 'Done editing' }));
  assert.equal((await screen.findByRole('textbox', { name: 'Translation' })).hasAttribute('readonly'), true);
});

test('a reviewer who may not edit is left in review whatever the handle asks', async () => {
  const ref = createRef<SourceTranslationViewerHandle>();
  render(<Harness variant="review" viewerRef={ref} reviewConfig={{ canEdit: false }} />);
  ref.current?.enterTranslationEditMode();
  assert.equal(translationPane().hasAttribute('readonly'), true);
});
