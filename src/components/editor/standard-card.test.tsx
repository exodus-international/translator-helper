import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';
import { cleanup, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { SourceProjectStatus } from '@/generated/prisma/enums';
import type { Edit } from '@/domain/scripture/scripture-check';
import { sourceKeyOf } from '@/domain/standard-translation/match-form';
import { buildStandardCheck } from '@/domain/standard-translation/standard-translation.check';
import type { StandardTranslationEditorEntry } from '@/domain/standard-translation/standard-translation.repository';
import { StandardCard, type StandardCardProps, type StandardItem } from './standard-card';
import type { StandardHost } from './standard-context';

/**
 * The card over a standard translation in the translation editor: what it
 * says of the text and which changes it offers. Assertions are on the words a
 * translator reads.
 */

afterEach(cleanup);

const SIGN_OF_THE_CROSS_EN = 'In the name of the Father, and of the Son, and of the Holy Spirit. Amen.';
const SIGN_OF_THE_CROSS_HR = 'U ime Oca i Sina i Duha Svetoga. Amen.';
const GLORY_BE_EN =
  'Glory be to the Father, and to the Son, and to the Holy Spirit,\nas it was in the beginning, is now, and ever shall be, world without end. Amen.';
const GLORY_BE_HR =
  'Slava Ocu i Sinu i Duhu Svetomu.\nKako bijaše na početku, tako i sada i vazda i u vijeke vjekova. Amen.';

const SOURCE = [
  '## Morning prayer',
  '',
  `*${SIGN_OF_THE_CROSS_EN}*`,
  '',
  '> *Glory be to the Father, and to the Son, and to the Holy Spirit,*',
  '> *as it was in the beginning, is now, and ever shall be, world without end. Amen.*',
].join('\n');
const TRANSLATION = [
  '## Jutarnja molitva',
  '',
  `*${SIGN_OF_THE_CROSS_HR}*`,
  '',
  '> *Slava Ocu i Sinu i Duhu Svetomu.*',
  '> *Kako je bilo na početku, tako i sada i vazda i u vijeke vjekova. Amen.*',
].join('\n');

let ids = 0;
function entry(
  name: string,
  sourceText: string,
  targetText: string,
  sourceProject: { id: string; name: string } | null = null,
): StandardTranslationEditorEntry {
  const at = new Date('2026-11-01T09:00:00Z');
  return {
    id: `entry-${++ids}`,
    languageId: 'hr',
    name,
    sourceText,
    sourceKey: sourceKeyOf(sourceText),
    targetText,
    fixedForm: false,
    note: null,
    createdAt: at,
    updatedAt: at,
    sourceProjectId: sourceProject?.id ?? null,
    sourceProject: sourceProject && { ...sourceProject, status: SourceProjectStatus.ACTIVE },
    createdBy: { id: 'u1', name: 'Marko P.' },
    updatedBy: { id: 'u2', name: 'Ana K.' },
  };
}

function itemOf(e: StandardTranslationEditorEntry): StandardItem {
  const [item] = buildStandardCheck({ source: SOURCE, translation: TRANSLATION, entries: [e] });
  return item;
}

function renderCard(props: Partial<StandardCardProps> & { item: StandardItem }) {
  const calls = { use: [] as Edit[], edit: [] as StandardTranslationEditorEntry[], close: 0 };
  const host: StandardHost = {
    language: { id: 'hr', name: 'Croatian' },
    entries: [props.item.entry],
    projects: [],
    sourceProjectId: null,
    sourceContent: SOURCE,
    view: null,
    registerView: () => () => {},
    editable: true,
    reportEditable: () => {},
    editEntry: (e) => calls.edit.push(e),
    addEntry: () => {},
  };
  render(
    <StandardCard
      host={host}
      languageCode="hr"
      readOnly={false}
      pinned={false}
      onUse={(edit) => calls.use.push(edit)}
      onClose={() => calls.close++}
      {...props}
    />,
  );
  return calls;
}

const signOfTheCross = () => entry('Sign of the Cross', SIGN_OF_THE_CROSS_EN, SIGN_OF_THE_CROSS_HR);
const gloryBe = () => entry('Glory Be', GLORY_BE_EN, GLORY_BE_HR);

test('a used standard text says so and offers no change', () => {
  renderCard({ item: itemOf(signOfTheCross()) });

  screen.getByText('Standard');
  screen.getByText('The text is the standard translation.');
  screen.getByText(/All projects in Croatian/);
  screen.getByText(/Updated by Ana K\./);
  assert.equal(screen.queryAllByRole('button', { name: /Use standard text/ }).length, 0);
});

test('a project entry names its project', () => {
  const exodus = { id: 'p1', name: 'Exodus 90' };
  renderCard({ item: itemOf(entry('Sign of the Cross', SIGN_OF_THE_CROSS_EN, SIGN_OF_THE_CROSS_HR, exodus)) });

  screen.getByText(/Standard translation · Exodus 90/);
});

test('a changed text shows the words to remove and to add, on the standard text’s lines', () => {
  renderCard({ item: itemOf(gloryBe()) });

  screen.getByText('Changed');
  screen.getByText('The text differs from the standard translation.');
  const diff = screen.getByText('This translation against the standard').nextElementSibling!;
  assert.deepEqual(
    [...diff.querySelectorAll('p')].map((p) => p.textContent),
    [
      'Slava Ocu i Sinu i Duhu Svetomu.',
      'Kako Remove: je bilo Add: bijaše na početku, tako i sada i vazda i u vijeke vjekova. Amen.',
    ],
  );
});

test('Use standard text applies the item’s edit once', async () => {
  const item = itemOf(gloryBe());
  const calls = renderCard({ item });

  await userEvent.click(screen.getByRole('button', { name: /Use standard text/ }));

  assert.deepEqual(calls.use, [item.edit]);
});

test('a translation that can’t be changed gets no Use standard text', () => {
  renderCard({ item: itemOf(gloryBe()), readOnly: true });

  screen.getByText('The text differs from the standard translation.');
  assert.equal(screen.queryAllByRole('button', { name: /Use standard text/ }).length, 0);
});

test('Edit entry opens the entry in the dialog', async () => {
  const e = gloryBe();
  const calls = renderCard({ item: itemOf(e) });

  await userEvent.click(screen.getByRole('button', { name: /Edit entry/ }));

  assert.deepEqual(calls.edit, [e]);
});

test('Open goes to the entry on the Standard translations page', () => {
  renderCard({ item: itemOf(gloryBe()) });

  const link = screen.getByRole('button', { name: /^Open/ });
  assert.equal(link.getAttribute('href'), '/standard-translations?lang=hr&q=Glory+Be');
});
