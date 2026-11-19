import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';
import { cleanup, render, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import type { PassageResult } from '@/domain/bible/bible.types';
import { findCitations } from '@/domain/scripture/citations';
import { buildCheckItems, type CheckItem } from '@/domain/scripture/scripture-check';
import { ScriptureCheck, type ScriptureCheckProps } from './scripture-check';

/**
 * The Scripture check in the document panel: what it lists for each citation
 * and which changes it offers. Assertions are on the words a translator reads.
 */

afterEach(cleanup);

const ok = (ref: string, rendered: string, verses: string[]): PassageResult => ({
  ref,
  status: 'ok',
  rendered,
  verses: verses.map((text, i) => ({ id: `X.1.${i + 1}`, chapter: 1, verse: i + 1, text })),
  text: verses.join(' '),
  notes: [],
});

const RESULTS = new Map<string, PassageResult>([
  ['John 3:16', ok('John 3:16', 'Iv 3,16', ['Bog je tako ljubio svijet.'])],
  ['Rim 8,28', ok('Rim 8,28', 'Rim 8,28', ['Znamo da Bog sve okreće na dobro.'])],
  ['Mk 1,15', ok('Mk 1,15', 'Mk 1,15', ['Obratite se i vjerujte evanđelju.'])],
  ['Ps 13,1', { ref: 'Ps 13,1', status: 'versification_unmapped', notes: ['PSA 13 has no mapping yet.'] }],
]);

function items(text: string): CheckItem[] {
  return buildCheckItems({ text, citations: findCitations(text), results: RESULTS });
}

function renderCheck(props: Partial<ScriptureCheckProps> & { items: CheckItem[] }) {
  const calls = { reveal: [] as CheckItem[], notation: [] as CheckItem[], text: [] as CheckItem[], fixAll: 0 };
  render(
    <ScriptureCheck
      state={{ kind: 'ready', bibleName: 'Jeruzalemska Biblija' }}
      sourceOnly={[]}
      checking={false}
      languageName="Croatian"
      onReveal={(item) => calls.reveal.push(item)}
      onFixNotation={(item) => calls.notation.push(item)}
      onUseOfficialText={(item) => calls.text.push(item)}
      onFixAllNotations={() => calls.fixAll++}
      {...props}
    />,
  );
  return calls;
}

const DOC = [
  'Kako kaže John 3:16.',
  'Rim 8,28 „Znamo da Bog sve okreće na dobro.“',
  'Mk 1,15 „Obratite se i vjerujte.“',
  'Ps 13,1',
].join('\n');

test('each citation is listed with its line and what it needs', () => {
  renderCheck({ items: items(DOC) });

  const rows = within(screen.getByRole('list', { name: 'Citations' })).getAllByRole('listitem');
  assert.equal(rows.length, 4);
  assert.match(rows[0].textContent ?? '', /John 3:16.*Iv 3,16.*English notation.*L1/);
  assert.match(rows[1].textContent ?? '', /Rim 8,28.*Official text.*L2/);
  assert.match(rows[2].textContent ?? '', /Mk 1,15.*Quote differs/);
  assert.match(rows[3].textContent ?? '', /Ps 13,1.*Numbering not mapped yet/);
  screen.getByText('4 citations, 3 to check');
});

test('a quotation that differs shows the words to remove and to add', () => {
  renderCheck({ items: items(DOC) });

  const row = within(screen.getByRole('list', { name: 'Citations' })).getAllByRole('listitem')[2];
  assert.ok(row.querySelector('del'));
  assert.match(row.querySelector('ins')?.textContent ?? '', /evanđelju/);
});

test('the buttons say what they change, and hand back the citation', async () => {
  const user = userEvent.setup();
  const calls = renderCheck({ items: items(DOC) });
  const rows = within(screen.getByRole('list', { name: 'Citations' })).getAllByRole('listitem');

  await user.click(within(rows[0]).getByRole('button', { name: 'Fix notation' }));
  await user.click(within(rows[2]).getByRole('button', { name: 'Use official text' }));
  await user.click(within(rows[1]).getByRole('button', { name: /line 2/ }));

  assert.deepEqual(
    calls.notation.map((i) => i.citation.text),
    ['John 3:16'],
  );
  assert.deepEqual(
    calls.text.map((i) => i.citation.text),
    ['Mk 1,15'],
  );
  assert.deepEqual(
    calls.reveal.map((i) => i.line),
    [2],
  );
  // Nothing to change on an official citation or an unresolved one.
  assert.equal(within(rows[1]).queryByRole('button', { name: /Fix notation|Use official text/ }), null);
  assert.equal(within(rows[3]).queryByRole('button', { name: /Fix notation|Use official text/ }), null);
});

test('fixing every notation is offered once there is more than one', async () => {
  const user = userEvent.setup();
  const one = renderCheck({ items: items(DOC) });
  assert.equal(screen.queryByRole('button', { name: /Fix all notations/ }), null);
  assert.equal(one.fixAll, 0);
  cleanup();

  const calls = renderCheck({ items: items('John 3:16 i opet John 3:16') });
  await user.click(screen.getByRole('button', { name: 'Fix all notations (2)' }));
  assert.equal(calls.fixAll, 1);
});

test('read-only, it lists but offers no changes', () => {
  renderCheck({ items: items('John 3:16 i opet John 3:16'), readOnly: true });
  assert.equal(screen.queryByRole('button', { name: /Fix|Use official/ }), null);
});

test('without a Bible it says so instead of listing', () => {
  renderCheck({ items: [], state: { kind: 'no-bible', languageName: 'Slovenian' } });
  screen.getByText(/No Bible is imported for Slovenian/);
  assert.equal(screen.queryByRole('list'), null);
});

test('an empty translation says what will be checked', () => {
  renderCheck({ items: [] });
  screen.getByText('No citations yet');
  screen.getByText(/checked against the Jeruzalemska Biblija/);
});

test('citations the source has and the translation lacks are listed apart', () => {
  renderCheck({ items: items('Rim 8,28'), sourceOnly: [{ ref: 'Romans 5:8', rendered: 'Rim 5,8' }] });
  const list = screen.getByRole('list', { name: 'Cited in the source only' });
  assert.equal(within(list).getByRole('listitem').textContent, 'Rim 5,8');
});

test('citations the Bible did not answer for are reported, never passed as official', async () => {
  let retried = 0;
  renderCheck({ items: items('Rim 8,28 „Znamo da Bog sve okreće na dobro.“'), unchecked: 2, onRetry: () => retried++ });
  assert.equal(screen.queryByText(/all official/), null);
  const alert = screen.getByRole('alert');
  assert.match(alert.textContent ?? '', /2 citations could not be checked/);
  await userEvent.click(within(alert).getByRole('button', { name: 'Try again' }));
  assert.equal(retried, 1);
});

test('with nothing answered, the card does not say there are no citations', () => {
  renderCheck({ items: [], unchecked: 1 });
  assert.equal(screen.queryByText('No citations yet'), null);
  assert.ok(screen.getByText('Citations not checked'));
});
