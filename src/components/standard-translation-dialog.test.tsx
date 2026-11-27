import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';
import { forwardRef, useImperativeHandle } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { CodeEditorHandle } from '@/components/editor/code-editor';
import { EditorImplementationProvider, type EditorComponent } from '@/components/editor/editor-implementation';
import { SourceProjectStatus } from '@/generated/prisma/enums';
import type { StandardTranslationRow } from '@/domain/standard-translation/standard-translation.repository';
import { StandardTranslationDialog } from './standard-translation-dialog';

/**
 * What the add/edit dialog sends: wording without layout, said out loud when
 * layout was typed, and never a language on an edit.
 */

afterEach(cleanup);

/** Stands in for the code editor, which needs a real browser to mount. */
const textareaEditor: EditorComponent = forwardRef<CodeEditorHandle, Parameters<EditorComponent>[0]>(
  function TextareaEditor({ value, onChange, ariaLabel }, ref) {
    useImperativeHandle(ref, () => ({ editor: null, view: null, fixAll: () => ({ fixed: 0, remaining: 0 }) }));
    return <textarea aria-label={ariaLabel} value={value} onChange={(event) => onChange?.(event.target.value)} />;
  },
);

const croatian = { id: '6f1c2d3e-0000-4000-8000-000000000001', name: 'Croatian' };
const exodus = { id: '6f1c2d3e-0000-4000-8000-0000000000e9', name: 'Exodus 90', status: SourceProjectStatus.ACTIVE };

const divineMercy: StandardTranslationRow = {
  id: '6f1c2d3e-0000-4000-8000-0000000000a1',
  languageId: croatian.id,
  name: 'Divine Mercy',
  sourceText: 'Jesus, I trust in you.',
  targetText: 'Isuse, uzdam se u Tebe!',
  fixedForm: false,
  note: null,
  createdAt: new Date('2026-11-01T10:00:00Z'),
  updatedAt: new Date('2026-11-02T10:00:00Z'),
  sourceProject: exodus,
  createdBy: { id: 'user-ana', name: 'Ana Kovač' },
  updatedBy: { id: 'user-ana', name: 'Ana Kovač' },
};

type Calls = { create: unknown[]; update: [string, unknown][] };

function renderDialog({ entry, create }: { entry?: StandardTranslationRow; create?: () => Promise<never> } = {}) {
  const calls: Calls = { create: [], update: [] };
  render(
    <EditorImplementationProvider editor={textareaEditor}>
      <StandardTranslationDialog
        open
        onOpenChange={() => {}}
        language={croatian}
        projects={[exodus]}
        entry={entry}
        create={
          create ??
          (async (input) => {
            calls.create.push(input);
            return divineMercy;
          })
        }
        update={async (id, input) => {
          calls.update.push([id, input]);
          return divineMercy;
        }}
      />
    </EditorImplementationProvider>,
  );
  return calls;
}

const sourceBox = () => screen.getByLabelText('Source · English');
const translationBox = () => screen.getByLabelText('Standard translation · Croatian');
const save = () => fireEvent.click(screen.getByRole('button', { name: 'Save standard translation' }));

test('text typed with layout is saved as its wording, and the dialog says what it left out', async () => {
  const calls = renderDialog();

  fireEvent.change(sourceBox(), { target: { value: '> *Glory be to the Father.* <!-- pause-duration="10s" -->' } });
  fireEvent.change(translationBox(), { target: { value: '> *Slava Ocu.*' } });

  assert.ok(
    screen.getByText(
      'Blockquote markers, the emphasis around the text and comments such as the pause marker were left out. Each document keeps its own layout; only the wording is saved.',
    ),
  );

  save();
  await waitFor(() => assert.equal(calls.create.length, 1));
  assert.deepEqual(calls.create[0], {
    languageId: croatian.id,
    sourceProjectId: null,
    name: '',
    sourceText: 'Glory be to the Father.',
    targetText: 'Slava Ocu.',
    fixedForm: false,
    note: '',
  });
});

test('plain wording shows no notice', () => {
  renderDialog();

  fireEvent.change(sourceBox(), { target: { value: 'Glory be to the Father.' } });
  fireEvent.change(translationBox(), { target: { value: 'Slava Ocu.' } });

  assert.equal(screen.queryAllByText(/left out/).length, 0);
});

test('an edit sends the entry without a language', async () => {
  const calls = renderDialog({ entry: divineMercy });

  assert.equal((screen.getByRole('radio', { name: /Only Exodus 90/ }) as HTMLInputElement).checked, true);
  fireEvent.click(screen.getByRole('radio', { name: /All projects in Croatian/ }));
  save();

  await waitFor(() => assert.equal(calls.update.length, 1));
  const [id, input] = calls.update[0];
  assert.equal(id, divineMercy.id);
  assert.equal('languageId' in (input as object), false);
  assert.deepEqual(input, {
    sourceProjectId: null,
    name: 'Divine Mercy',
    sourceText: 'Jesus, I trust in you.',
    targetText: 'Isuse, uzdam se u Tebe!',
    fixedForm: false,
    note: '',
  });
});

test('an error from the action shows in the dialog', async () => {
  renderDialog({
    create: async () => {
      throw new Error('A standard translation with this source already exists for all projects in Croatian');
    },
  });

  fireEvent.change(sourceBox(), { target: { value: 'Glory be to the Father.' } });
  fireEvent.change(translationBox(), { target: { value: 'Slava Ocu.' } });
  save();

  assert.ok(
    await screen.findByText('A standard translation with this source already exists for all projects in Croatian'),
  );
});
