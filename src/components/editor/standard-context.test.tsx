import assert from 'node:assert/strict';
import test, { afterEach, mock } from 'node:test';
import { useEffect } from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { sourceKeyOf } from '@/domain/standard-translation/match-form';
import type { StandardTranslationEditorEntry } from '@/domain/standard-translation/standard-translation.repository';
import { StandardProvider } from './standard-context';
import { useStandardHost } from './standard-host';

afterEach(cleanup);

/** The provider's own report, apart from anything React logs. */
const READ_FAILED = 'Standard translations could not be read';
const reports = (error: { mock: { calls: { arguments: unknown[] }[] } }) =>
  error.mock.calls.filter((call) => call.arguments[0] === READ_FAILED).length;

const croatian = { id: '6f1c2d3e-0000-4000-8000-000000000001', code: 'hr', name: 'Croatian' };

const glory: StandardTranslationEditorEntry = {
  id: 'entry-glory',
  languageId: croatian.id,
  name: 'Glory Be',
  sourceText: 'Glory be to the Father.',
  sourceKey: sourceKeyOf('Glory be to the Father.'),
  targetText: 'Slava Ocu.',
  fixedForm: false,
  note: null,
  sourceProjectId: null,
  sourceProject: null,
  createdAt: new Date(0),
  updatedAt: new Date(0),
  createdBy: null,
  updatedBy: null,
};

/** What the editor's tools see: the entries' names, or that there is no host. */
function Tools() {
  const host = useStandardHost();
  return <output aria-label="Tools">{host ? host.entries.map((entry) => entry.name).join(', ') : 'none'}</output>;
}

function renderProvider(load: Parameters<typeof StandardProvider>[0]['load']) {
  render(
    <StandardProvider documentId="6f1c2d3e-0000-4000-8000-0000000000d1" language={croatian} sourceContent="" load={load}>
      <Tools />
    </StandardProvider>,
  );
  return () => screen.getByRole('status', { name: 'Tools' }).textContent;
}

test("a team member's editor gets the document's entries", async () => {
  const tools = renderProvider(async () => ({ entries: [glory], projects: [], sourceProjectId: null }));
  await waitFor(() => assert.equal(tools(), 'Glory Be'));
});

test('someone outside the team gets no tools and no error', async () => {
  const error = mock.method(console, 'error', () => {});
  try {
    const tools = renderProvider(async () => null);
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(tools(), 'none');
    assert.equal(reports(error), 0);
  } finally {
    error.mock.restore();
  }
});

test('entries that could not be read leave the editor without the tools, and say why in the console', async () => {
  const error = mock.method(console, 'error', () => {});
  try {
    const tools = renderProvider(async () => {
      throw new Error('network down');
    });
    await waitFor(() => assert.equal(reports(error), 1));
    assert.equal(tools(), 'none');
  } finally {
    error.mock.restore();
  }
});

test('the editor inside stays mounted when the entries arrive, keeping what it holds', async () => {
  let mounts = 0;
  function Editor() {
    useEffect(() => {
      mounts++;
    }, []);
    return <Tools />;
  }
  render(
    <StandardProvider
      documentId="6f1c2d3e-0000-4000-8000-0000000000d1"
      language={croatian}
      sourceContent=""
      load={async () => ({ entries: [glory], projects: [], sourceProjectId: null })}
    >
      <Editor />
    </StandardProvider>,
  );
  await waitFor(() => assert.equal(screen.getByRole('status', { name: 'Tools' }).textContent, 'Glory Be'));
  assert.equal(mounts, 1);
});
