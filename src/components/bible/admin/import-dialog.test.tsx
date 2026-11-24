import assert from 'node:assert/strict';
import { gunzipSync } from 'node:zlib';
import test, { afterEach } from 'node:test';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { BibleTranslationDto } from '@/domain/bible/bible.service';
import { ImportBibleDialog } from './import-dialog';

/**
 * The import dialog is the one way a Bible gets in from the browser: it has to
 * shrink the file before it leaves, and an import that succeeds with warnings
 * has to show them rather than close as if all were well.
 */

const realFetch = globalThis.fetch;

afterEach(() => {
  cleanup();
  globalThis.fetch = realFetch;
});

const sarHr: BibleTranslationDto = {
  code: 'sar-hr',
  name: 'Šarić',
  language: 'hr',
  languageName: 'Hrvatski',
  role: 'target',
  isLanguageDefault: true,
  bookCount: 73,
  verseCount: 35000,
  importedAt: '2026-11-01T10:00:00.000Z',
  versification: { declaredBooks: 73, presentBooks: 73, reviewedBooks: 10, unmappableChapters: 0 },
};

function stubFetch(body: unknown, status = 200) {
  const calls: { url: string; form: FormData }[] = [];
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    calls.push({ url, form: init.body as FormData });
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  return calls;
}

function chooseFile(label: RegExp, name: string, text: string) {
  const input = screen.getByLabelText(label) as HTMLInputElement;
  fireEvent.change(input, { target: { files: [new File([text], name, { type: 'application/json' })] } });
}

test('a translation file is gzipped, posted, and its warnings are shown after the import', async () => {
  const calls = stubFetch({
    ok: true,
    code: 'sar-hr',
    books: 72,
    verses: 35210,
    declaredBooks: 72,
    replaced: true,
    warnings: ['Aligned to 72 of the 73 canon books.'],
  });
  let imported = 0;
  render(<ImportBibleDialog open onOpenChange={() => {}} translations={[sarHr]} onImported={() => imported++} />);

  const json = JSON.stringify({ code: 'sar-hr', books: [] });
  chooseFile(/^Translation file/, 'sar-hr.json', json);
  fireEvent.click(screen.getByRole('button', { name: 'Import' }));

  await waitFor(() => assert.ok(screen.getByText('Replaced sar-hr')));
  assert.ok(screen.getByText('Aligned to 72 of the 73 canon books.'));
  assert.equal(imported, 1);

  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.url, '/api/admin/bible/import');
  const sent = calls[0]!.form.get('translation') as File;
  assert.equal(sent.name, 'sar-hr.json.gz');
  assert.equal(gunzipSync(Buffer.from(await sent.arrayBuffer())).toString('utf8'), json);
  // Empty metadata stays off the form, so the server's catalog fills it in.
  assert.equal(calls[0]!.form.get('name'), null);
});

test('a refused import keeps the dialog on the form and says why', async () => {
  stubFetch({ error: "'rsvce-en' is already the source translation; delete it first." }, 422);
  render(<ImportBibleDialog open onOpenChange={() => {}} translations={[sarHr]} onImported={() => {}} />);

  chooseFile(/^Translation file/, 'other.json', '{}');
  fireEvent.click(screen.getByRole('button', { name: 'Import' }));

  await waitFor(() => assert.ok(screen.getByText("'rsvce-en' is already the source translation; delete it first.")));
  assert.ok(screen.getByRole('button', { name: 'Import' }));
});
