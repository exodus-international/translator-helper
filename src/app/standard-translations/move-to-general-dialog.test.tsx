import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { SourceProjectStatus } from '@/generated/prisma/enums';
import type { StandardTranslationRow } from '@/domain/standard-translation/standard-translation.repository';
import { MoveToGeneralDialog } from './move-to-general-dialog';

/**
 * Moving a project entry to all projects: straight away when nothing clashes,
 * and otherwise only after the person has seen both entries and chosen one.
 */

afterEach(cleanup);

const exodus = { id: 'project-exodus', name: 'Exodus 90', status: SourceProjectStatus.ACTIVE };
const someone = { id: 'user-ana', name: 'Ana Kovač' };

function entry(overrides: Partial<StandardTranslationRow>): StandardTranslationRow {
  return {
    id: 'entry',
    languageId: 'lang-hr',
    name: null,
    sourceText: 'Jesus, I trust in you.',
    targetText: 'Isuse, uzdam se u Tebe!',
    fixedForm: false,
    note: null,
    createdAt: new Date('2026-11-01T10:00:00Z'),
    updatedAt: new Date('2026-11-02T10:00:00Z'),
    sourceProject: null,
    createdBy: someone,
    updatedBy: someone,
    ...overrides,
  };
}

const projectEntry = entry({ id: 'entry-project', name: 'Divine Mercy', sourceProject: exodus });
const generalEntry = entry({ id: 'entry-general', targetText: 'Isuse, ja se uzdam u Tebe.' });

function renderMove(conflict: StandardTranslationRow | null) {
  const sent: [string, unknown][] = [];
  render(
    <MoveToGeneralDialog
      open
      pending={{ entry: projectEntry, conflict }}
      languageName="Croatian"
      onOpenChange={() => {}}
      onMoved={() => {}}
      move={async (id, input) => {
        sent.push([id, input]);
        return generalEntry;
      }}
    />,
  );
  return sent;
}

test('a clash shows this project’s entry beside the general one', () => {
  renderMove(generalEntry);

  const mine = screen.getByRole('region', { name: 'This one · Exodus 90' });
  const general = screen.getByRole('region', { name: 'The general one · All projects' });
  assert.ok(within(mine).getByText('Isuse, uzdam se u Tebe!'));
  assert.ok(within(general).getByText('Isuse, ja se uzdam u Tebe.'));
});

for (const { choice, conflict, sends } of [
  { choice: 'Keep this one', conflict: generalEntry, sends: { keep: 'project' } },
  { choice: 'Keep the general one', conflict: generalEntry, sends: { keep: 'general' } },
  { choice: 'Move to all projects', conflict: null, sends: {} },
]) {
  test(`“${choice}” moves the entry with ${JSON.stringify(sends)}`, async () => {
    const sent = renderMove(conflict);

    fireEvent.click(screen.getByRole('button', { name: choice }));

    await waitFor(() => assert.deepEqual(sent, [[projectEntry.id, sends]]));
  });
}
