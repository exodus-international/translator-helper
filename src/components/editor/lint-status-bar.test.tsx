import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';
import { cleanup, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { LintStatusBar } from './lint-status-bar';
import type { LintDiagnostic, LintSeverity } from '@/lib/lint';

/**
 * The bar under the translation editor: what it says the lint found, and when
 * it offers to fix it. Assertions are on the words a translator reads.
 */

afterEach(cleanup);

let offset = 0;

function diagnostic(severity: LintSeverity, fix?: { safe?: boolean }): LintDiagnostic {
  const from = (offset += 10);
  return {
    ruleId: 'test-rule',
    severity,
    message: 'Something to look at.',
    from,
    to: from + 1,
    fix: fix ? { title: 'Fix it', edits: [{ from, to: from + 1, insert: '' }], safe: fix.safe } : undefined,
  };
}

test('a clean document says so, and offers nothing to fix', () => {
  render(<LintStatusBar diagnostics={[]} onFixAll={() => {}} />);

  screen.getByText('No content issues');
  assert.equal(screen.queryByRole('button'), null);
});

test('each severity is counted under its own name', () => {
  render(
    <LintStatusBar
      diagnostics={[diagnostic('error'), diagnostic('warning'), diagnostic('warning'), diagnostic('info')]}
      onFixAll={() => {}}
    />,
  );

  screen.getByText('1 error');
  screen.getByText('2 warnings');
  screen.getByText('1 suggestion');
  assert.equal(screen.queryByText('No content issues'), null);
});

test('the button counts only the fixes that can be applied unasked', () => {
  render(
    <LintStatusBar
      diagnostics={[
        diagnostic('warning', { safe: true }),
        diagnostic('info', {}),
        diagnostic('error', { safe: false }),
        diagnostic('error'),
      ]}
      onFixAll={() => {}}
    />,
  );

  screen.getByRole('button', { name: 'Fix all 2' });
});

test('a document whose every problem needs a human is reported without a button', () => {
  render(
    <LintStatusBar diagnostics={[diagnostic('error'), diagnostic('error', { safe: false })]} onFixAll={() => {}} />,
  );

  screen.getByText('2 errors');
  assert.equal(screen.queryByRole('button'), null);
});

test('pressing it asks for the fixes to be applied', async () => {
  let asked = 0;
  render(<LintStatusBar diagnostics={[diagnostic('warning', { safe: true })]} onFixAll={() => (asked += 1)} />);

  await userEvent.click(screen.getByRole('button', { name: 'Fix all 1' }));

  assert.equal(asked, 1);
});
