import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { SourceProjectStatus } from '@/generated/prisma/enums';
import type {
  StandardTranslationRow,
  StandardTranslationsPage,
} from '@/domain/standard-translation/standard-translation.repository';
import { createTestRouter } from '../../../tests/next-router';
import StandardTranslationsClient from './page.client';

/**
 * The page around the table: its actions, the empty state, and the line that
 * owns up to entries the default scope hides.
 */

afterEach(cleanup);

const exodus = { id: '6f1c2d3e-0000-4000-8000-0000000000e9', name: 'Exodus 90', status: SourceProjectStatus.ACTIVE };
const lent = { id: '6f1c2d3e-0000-4000-8000-0000000000f1', name: 'Lent 2026', status: SourceProjectStatus.COMPLETE };
const someone = { id: 'user-ana', name: 'Ana Kovač' };

const gloryBe: StandardTranslationRow = {
  id: 'entry-glory-be',
  languageId: 'lang-hr',
  name: 'Glory Be',
  sourceText: 'Glory be to the Father, and to the Son, and to the Holy Spirit.',
  targetText: 'Slava Ocu i Sinu i Duhu Svetomu.',
  fixedForm: false,
  note: null,
  createdAt: new Date('2026-11-01T10:00:00Z'),
  updatedAt: new Date('2026-11-02T10:00:00Z'),
  sourceProject: exodus,
  createdBy: someone,
  updatedBy: someone,
};

const list: StandardTranslationsPage = {
  rows: [gloryBe],
  total: 1,
  selection: { includeGeneral: true, projectIds: [exodus.id] },
  hiddenCompletedCount: 12,
  scopes: {
    general: 0,
    projects: [
      { ...exodus, count: 1 },
      { ...lent, count: 12 },
    ],
  },
};

function renderPage({ page = list }: { page?: StandardTranslationsPage } = {}) {
  const { TestRouter, pushed } = createTestRouter('/standard-translations', 'lang=hr');
  render(
    <TestRouter>
      <StandardTranslationsClient
        languages={[{ id: 'lang-hr', code: 'hr', name: 'Croatian' }]}
        selectedCode="hr"
        list={page}
        q=""
        page={1}
      />
    </TestRouter>,
  );
  return pushed;
}

test('a team member gets Add and a menu on each row', () => {
  renderPage();

  assert.ok(screen.getByRole('button', { name: 'Add' }));
  assert.ok(screen.getByRole('button', { name: 'Actions for Glory Be' }));
});

test('hidden entries of completed projects are counted, and Show them adds those projects', () => {
  const pushed = renderPage();

  assert.ok(screen.getByText(/12 entries from completed projects are hidden\./));
  fireEvent.click(screen.getByRole('button', { name: 'Show them' }));

  assert.equal(pushed.length, 1);
  const url = new URL(pushed[0], 'http://localhost');
  assert.equal(url.searchParams.get('lang'), 'hr');
  assert.equal(url.searchParams.get('scope'), `general,${exodus.id},${lent.id}`);
});

test('an empty table says the scope hides entries when the language has some', () => {
  renderPage({
    page: {
      ...list,
      rows: [],
      total: 0,
      selection: { includeGeneral: true, projectIds: [] },
      scopes: { general: 0, projects: [{ ...exodus, count: 0 }, { ...lent, count: 12 }] },
    },
  });

  assert.ok(screen.getByText('No standard translations in this scope'));
  assert.equal(screen.queryByText('No standard translations yet'), null);
});

test('an empty table invites the first entry when the language has none', () => {
  renderPage({
    page: {
      ...list,
      rows: [],
      total: 0,
      hiddenCompletedCount: 0,
      scopes: { general: 0, projects: [{ ...exodus, count: 0 }] },
    },
  });

  assert.ok(screen.getByText('No standard translations yet'));
});
