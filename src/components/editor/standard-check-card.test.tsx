import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';
import { history, undo } from '@codemirror/commands';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { cleanup, render, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { sourceKeyOf } from '@/domain/standard-translation/match-form';
import type { StandardState } from '@/domain/standard-translation/standard-translation.check';
import { EditorProvider, useEditorStore } from '@/lib/stores/editor-provider';
import type { EditorStoreDeps } from '@/lib/stores/editor-store';
import { StandardCheckCard, useStandardCheck } from './standard-check-card';
import type { StandardRowItem } from './standard-check-rows';
import type { StandardHost } from './standard-context';

/**
 * The standard translations card in the document panel: what it lists for
 * each standard translation the source uses, and the changes it makes in the
 * translation editor.
 */

const views: EditorView[] = [];
afterEach(() => {
  cleanup();
  views.splice(0).forEach((view) => view.destroy());
});

const TRANSLATION = ['U ime Oca. Amen.', '', 'Započni znakom križa.', '', 'Slava Ocu.', 'Kako je bilo.'].join('\n');

let ids = 0;
/** An item of the check, at `text` in the translation (none when Missing). */
function item(
  state: StandardState,
  {
    name = null as string | null,
    kind = 'verbatim' as 'verbatim' | 'term',
    lines = [1, 1],
    text = '',
    insert = '',
  } = {},
): StandardRowItem {
  const from = TRANSLATION.indexOf(text);
  return {
    entry: {
      id: `entry-${++ids}`,
      name,
      sourceText: 'source',
      sourceKey: 'source',
      targetText: text || 'target',
      fixedForm: false,
      sourceProjectId: null,
    },
    kind,
    state,
    source: { from: 0, to: 0, firstLine: lines[0], lastLine: lines[1] },
    range: state === 'missing' ? null : { from, to: from + text.length },
    diff: null,
    changedWords: state === 'changed' ? 1 : 0,
    edit: insert ? { from, to: from + text.length, insert, expected: text } : null,
  };
}

const ITEMS = [
  item('used', { name: 'Sign of the Cross', lines: [1, 1], text: 'U ime Oca. Amen.' }),
  item('used', { kind: 'term', lines: [3, 3], text: 'znakom križa' }),
  item('changed', { name: 'Glory Be', lines: [5, 5], text: 'Slava Ocu.', insert: 'Slava Ocu i Sinu.' }),
  item('changed', { name: 'Kako', lines: [6, 6], text: 'Kako je bilo.', insert: 'Kako bijaše.' }),
  item('missing', { name: 'Exodus 90', lines: [9, 9] }),
];

function editorView(): EditorView {
  const view = new EditorView({
    state: EditorState.create({ doc: TRANSLATION, extensions: [history()] }),
    parent: document.body,
  });
  views.push(view);
  return view;
}

function Store({ children }: { children: React.ReactNode }) {
  return (
    <EditorProvider
      documentId="doc-1"
      documentTitle="Day 1"
      sourceLanguageName="English"
      originalFilename="1.md"
      targetLanguageId="lang-hr"
      targetVersion={{ id: 'v1', content: TRANSLATION }}
      sourceContent=""
      initialSuggestions={[]}
      translationProjectId={null}
      audioTextVersionId={null}
      deps={{} as EditorStoreDeps}
    >
      {children}
    </EditorProvider>
  );
}

/** The translation as the store has it. */
function StoreContent() {
  return <output aria-label="Store content">{useEditorStore((s) => s.content)}</output>;
}

function renderCard({
  view = editorView() as EditorView | null,
  editable = true,
  items = ITEMS,
  languageCode = 'hr' as string | null,
} = {}) {
  render(
    <Store>
      <StandardCheckCard
        host={{ view, editable }}
        items={items}
        languageCode={languageCode}
        open
        onOpenChange={() => {}}
      />
      <StoreContent />
    </Store>,
  );
  return within(screen.getByRole('list', { name: 'Standard translations' })).getAllByRole('listitem');
}

test('each item is listed with its state, its name and where it is', () => {
  const rows = renderCard();

  assert.deepEqual(
    rows.map((row) => row.textContent),
    [
      'UsedSign of the CrossLine 1 · verbatim',
      'Usedznakom križaLine 3 · term',
      'ChangedGlory BeLine 5 · 1 word differsUse',
      'ChangedKakoLine 6 · 1 word differsUse',
      'MissingExodus 90In the source on line 9, not found in the translation',
    ],
  );
  screen.getByText('3 to check');
});

test('nothing to check, the header says nothing', () => {
  renderCard({ items: ITEMS.slice(0, 2) });
  assert.equal(screen.queryAllByText(/to check/).length, 0);
});

test('Use writes that one standard text into the editor', async () => {
  const user = userEvent.setup();
  const view = editorView();
  const rows = renderCard({ view });

  await user.click(within(rows[2]).getByRole('button', { name: 'Use' }));

  assert.equal(view.state.doc.toString(), TRANSLATION.replace('Slava Ocu.', 'Slava Ocu i Sinu.'));
});

test('Apply all writes every changed standard text in, as one undo step', async () => {
  const user = userEvent.setup();
  const view = editorView();
  renderCard({ view });

  await user.click(screen.getByRole('button', { name: 'Apply all standard texts' }));

  assert.equal(
    view.state.doc.toString(),
    TRANSLATION.replace('Slava Ocu.', 'Slava Ocu i Sinu.').replace('Kako je bilo.', 'Kako bijaše.'),
  );
  undo(view);
  assert.equal(view.state.doc.toString(), TRANSLATION);
});

test('without the editor on screen, the standard text is written into the stored translation', async () => {
  const user = userEvent.setup();
  const rows = renderCard({ view: null });

  await user.click(within(rows[2]).getByRole('button', { name: 'Use' }));

  assert.equal(
    screen.getByRole('status', { name: 'Store content' }).textContent,
    TRANSLATION.replace('Slava Ocu.', 'Slava Ocu i Sinu.'),
  );
});

test('clicking an item selects it in the editor', async () => {
  const user = userEvent.setup();
  const view = editorView();
  const rows = renderCard({ view });

  await user.click(within(rows[1]).getByRole('button', { name: /znakom križa/ }));

  const { from, to } = view.state.selection.main;
  assert.equal(view.state.sliceDoc(from, to), 'znakom križa');
  // A Missing item has nothing in the translation to show.
  assert.equal(within(rows[4]).queryAllByRole('button').length, 0);
});

test('read-only, it lists but changes nothing', () => {
  renderCard({ editable: false });

  assert.equal(screen.queryAllByRole('button', { name: 'Use' }).length, 0);
  assert.equal(screen.getByRole('button', { name: 'Apply all standard texts' }).hasAttribute('disabled'), true);
});

test('with nothing changed, there is nothing to apply', () => {
  renderCard({ items: [ITEMS[0], ITEMS[4]] });
  assert.equal(screen.getByRole('button', { name: 'Apply all standard texts' }).hasAttribute('disabled'), true);
});

test('Manage opens the language’s standard translations', () => {
  renderCard();
  assert.equal(screen.getByRole('link', { name: 'Manage' }).getAttribute('href'), '/standard-translations?lang=hr');
  cleanup();

  renderCard({ languageCode: null });
  assert.equal(screen.getByRole('link', { name: 'Manage' }).getAttribute('href'), '/standard-translations');
});

// ─── The check the panel shows it for ─────────────────────

function CheckCount({ host }: { host: StandardHost | null }) {
  return <output aria-label="Items">{useStandardCheck(host).length}</output>;
}

const host = (sourceContent: string): StandardHost => ({
  language: { id: 'lang-hr', name: 'Croatian' },
  entries: [
    {
      id: 'entry-sign',
      name: 'Sign of the Cross',
      sourceText: 'Sign of the Cross',
      sourceKey: sourceKeyOf('Sign of the Cross'),
      targetText: 'znak križa',
      fixedForm: false,
      sourceProjectId: null,
      languageId: 'lang-hr',
      note: null,
      createdAt: new Date(0),
      updatedAt: new Date(0),
      sourceProject: null,
      createdBy: null,
      updatedBy: null,
    },
  ],
  projects: [],
  sourceProjectId: null,
  sourceContent,
  view: null,
  registerView: () => () => {},
  editable: true,
  reportEditable: () => {},
  editEntry: () => {},
  addEntry: () => {},
});

test('the check finds what the source uses, and nothing without a host or a use', () => {
  const count = (h: StandardHost | null) => {
    render(
      <Store>
        <CheckCount host={h} />
      </Store>,
    );
    const text = screen.getByRole('status', { name: 'Items' }).textContent;
    cleanup();
    return text;
  };

  assert.equal(count(host('Begin with the Sign of the Cross.')), '1');
  assert.equal(count(host('Begin in silence.')), '0');
  assert.equal(count(null), '0');
});
