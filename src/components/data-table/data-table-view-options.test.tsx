import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NuqsTestingAdapter } from 'nuqs/adapters/testing';
import type { ColumnDef } from '@tanstack/react-table';
import { useDataTable } from '@/hooks/use-data-table';
import { DataTableViewOptions } from './data-table-view-options';

/**
 * Sentry EXODUS-TRANSLATIONS-4R: the label sat outside a menu group, so Base UI
 * threw error #31 as soon as the View menu opened.
 */

afterEach(cleanup);

interface Row {
  name: string;
  email: string;
}

const columns: ColumnDef<Row, unknown>[] = [
  { id: 'name', accessorKey: 'name', meta: { label: 'Name' } },
  { id: 'email', accessorKey: 'email', meta: { label: 'Email' } },
];
const data: Row[] = [{ name: 'Ada', email: 'ada@example.org' }];

function Harness() {
  const { table } = useDataTable<Row>({ data, columns: columns as never });
  const visible = table
    .getAllColumns()
    .filter((column) => column.getIsVisible())
    .map((column) => column.id)
    .join(',');
  return (
    <>
      <DataTableViewOptions table={table} />
      <p>visible: {visible}</p>
    </>
  );
}

function renderHarness() {
  render(
    <NuqsTestingAdapter>
      <Harness />
    </NuqsTestingAdapter>,
  );
}

test('the View menu opens and lists the label and every column', async () => {
  renderHarness();
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Toggle columns' }));

  assert.ok(await screen.findByText('Toggle columns', { selector: '[data-slot], div, span' }));
  assert.ok(screen.getByRole('menuitemcheckbox', { name: 'Name' }));
  assert.ok(screen.getByRole('menuitemcheckbox', { name: 'Email' }));
});

test('toggling a column in the View menu hides it', async () => {
  renderHarness();
  const user = userEvent.setup();
  assert.ok(screen.getByText('visible: name,email'));

  await user.click(screen.getByRole('button', { name: 'Toggle columns' }));
  await user.click(await screen.findByRole('menuitemcheckbox', { name: 'Email' }));

  assert.ok(await screen.findByText('visible: name'));
});
