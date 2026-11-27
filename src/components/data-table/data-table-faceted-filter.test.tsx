import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NuqsTestingAdapter } from 'nuqs/adapters/testing';
import type { ColumnDef } from '@tanstack/react-table';
import { useDataTable, type DataTableFeatures } from '@/hooks/use-data-table';
import { DataTableFacetedFilter } from './data-table-faceted-filter';

/**
 * Sentry EXODUS-TRANSLATIONS-4Q: the title was a bare text node in the trigger.
 * Browser page translation swaps such a node for a <font> element, and React's
 * insertBefore (icon swap after a selection) then failed with NotFoundError.
 */

afterEach(cleanup);

interface Row {
  role: string;
}

const columns: ColumnDef<DataTableFeatures, Row>[] = [
  {
    id: 'role',
    accessorKey: 'role',
    enableColumnFilter: true,
    meta: {
      label: 'Role',
      variant: 'multiSelect',
      options: [
        { label: 'Admin', value: 'admin' },
        { label: 'Translator', value: 'translator' },
      ],
    },
  },
];
const data: Row[] = [{ role: 'admin' }, { role: 'translator' }];
const options = [
  { label: 'Admin', value: 'admin' },
  { label: 'Translator', value: 'translator' },
];

function Harness() {
  const { table } = useDataTable<Row>({ data, columns });
  return <DataTableFacetedFilter column={table.getColumn('role')} title="Role" options={options} />;
}

function renderHarness() {
  render(
    <NuqsTestingAdapter>
      <Harness />
    </NuqsTestingAdapter>,
  );
}

test('the filter trigger shows its title', () => {
  renderHarness();
  assert.ok(within(screen.getByRole('button', { name: /Role/ })).getByText('Role'));
});

test('the title is not a bare text node of the trigger', () => {
  renderHarness();
  const trigger = screen.getByRole('button', { name: /Role/ });
  const bareText = Array.from(trigger.childNodes).filter(
    (node) => node.nodeType === 3 && node.textContent?.includes('Role'),
  );
  assert.equal(bareText.length, 0, 'title must sit inside its own element');
});

test('selecting an option works after page translation replaced the title node', async () => {
  renderHarness();
  const user = userEvent.setup();
  const trigger = screen.getByRole('button', { name: /Role/ });

  // Page translation: swap the text node holding the title for a <font> element.
  const findTitleNode = (node: Node): Node | null => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === 3 && child.textContent === 'Role') return child;
      const found = findTitleNode(child);
      if (found) return found;
    }
    return null;
  };
  const titleNode = findTitleNode(trigger);
  assert.ok(titleNode, 'title text node exists');
  const font = document.createElement('font');
  font.textContent = 'Role';
  titleNode.parentNode?.replaceChild(font, titleNode);

  await user.click(trigger);
  await user.click(await screen.findByRole('option', { name: /Admin/ }));

  assert.ok(await screen.findByRole('button', { name: 'Clear Role filter' }));
});
