import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import type { ReferenceCheck } from '@/domain/bible/bible.types';
import { STATUS_LABEL } from '@/domain/scripture/scripture-check';
import { CitationSummary } from './citation-summary';

/**
 * The summary under a new document's content box: the citations the source
 * has, which RSV-CE resolves and which it does not, and why.
 */

afterEach(cleanup);

const CHECKS: Record<string, ReferenceCheck> = {
  'John 3:16': { ref: 'John 3:16', status: 'ok', normalized: 'John 3:16', notes: [] },
  'Ps 46:10': { ref: 'Ps 46:10', status: 'ok', normalized: 'Psalm 46:10', notes: [] },
  'John 30:1': { ref: 'John 30:1', status: 'out_of_range', notes: ['John has 21 chapters.'] },
};

function checker() {
  const asked: string[][] = [];
  const check = async (refs: string[]) => {
    asked.push(refs);
    return new Map(refs.filter((r) => CHECKS[r]).map((r) => [r, CHECKS[r]]));
  };
  return { check, asked };
}

test('lists what RSV-CE resolves, by its full name, and what it does not, with the reason', async () => {
  const { check, asked } = checker();
  render(<CitationSummary content={'Love (John 3:16).\nBe still (Ps 46:10). Also John 30:1.'} check={check} />);

  assert.ok(screen.getByText('Checking Bible citations…'));
  await waitFor(() => screen.getByText('3 Bible citations: 2 found in RSV-CE, 1 not.'), { timeout: 2_000 });
  assert.deepEqual(asked, [['John 3:16', 'Ps 46:10', 'John 30:1']]);

  const found = screen.getByRole('list', { name: 'Citations found' });
  assert.equal(found.textContent, 'John 3:16Psalm 46:10');
  assert.ok(screen.getByText(STATUS_LABEL.out_of_range));
  assert.ok(screen.getByText(': John has 21 chapters.'));
});

test('says when every citation is found', async () => {
  const { check } = checker();
  render(<CitationSummary content="John 3:16" check={check} />);
  await waitFor(() => screen.getByText('1 Bible citation, all found in RSV-CE.'), { timeout: 2_000 });
});

test('says the check failed without blocking the document', async () => {
  render(<CitationSummary content="John 3:16" check={() => Promise.reject(new Error('down'))} />);
  await waitFor(
    () => screen.getByText('The Bible citations could not be checked right now. You can still create the document.'),
    { timeout: 2_000 },
  );
});

test('shows nothing for a document with no citations', () => {
  const { check, asked } = checker();
  const { container } = render(<CitationSummary content="No Scripture here." check={check} />);
  assert.equal(container.textContent, '');
  assert.equal(asked.length, 0);
});
