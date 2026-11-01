import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import OvTable from '../src/components/OvTable.vue';
import type { TableColumn, TableSort } from '../src';

interface Row {
  id: string;
  name: string;
  total: number | null;
}
const rows: Row[] = [
  { id: 'a', name: 'Jasmine Carter', total: 72000 },
  { id: 'b', name: 'Atlanta Reno Co.', total: 79500 },
  { id: 'c', name: 'Tom Reyes', total: null },
  { id: 'd', name: 'Bell Renovations', total: 59500 },
];
const columns: TableColumn<Row>[] = [
  { key: 'name', label: 'Customer', sortable: true },
  { key: 'total', label: 'Total', align: 'right', sortable: true, sortFirst: 'desc' },
  { key: 'actions', label: 'Actions', hideLabel: true },
];
const names = (w: ReturnType<typeof mount>) => w.findAll('tbody tr').map((tr) => tr.find('td').text());

describe('OvTable', () => {
  it('emits sort updates, sets aria-sort on the sorted header and sorts rows', async () => {
    const w = mount(OvTable<Row>, {
      props: { columns, rows, sort: null as TableSort | null, 'onUpdate:sort': (s: TableSort | null) => w.setProps({ sort: s }) },
    });
    const th = (i: number) => w.findAll('th')[i]!;
    expect(th(0).attributes('aria-sort')).toBeUndefined();
    expect(th(2).find('.ov-sr').text()).toBe('Actions');
    expect(th(1).classes()).toContain('num');

    await th(0).get('button').trigger('click');
    expect(w.emitted('update:sort')!.at(-1)).toEqual([{ key: 'name', dir: 'asc' }]);
    expect(th(0).attributes('aria-sort')).toBe('ascending');
    expect(names(w)).toEqual(['Atlanta Reno Co.', 'Bell Renovations', 'Jasmine Carter', 'Tom Reyes']);

    await th(0).get('button').trigger('click');
    expect(w.emitted('update:sort')!.at(-1)).toEqual([{ key: 'name', dir: 'desc' }]);
    expect(th(0).attributes('aria-sort')).toBe('descending');

    // A new column starts with its own first direction; empty values stay last.
    await th(1).get('button').trigger('click');
    expect(w.emitted('update:sort')!.at(-1)).toEqual([{ key: 'total', dir: 'desc' }]);
    expect(th(0).attributes('aria-sort')).toBeUndefined();
    expect(th(1).attributes('aria-sort')).toBe('descending');
    expect(names(w)).toEqual(['Atlanta Reno Co.', 'Jasmine Carter', 'Bell Renovations', 'Tom Reyes']);
  });

  it('leaves order alone with manualSort, renders cell slots, labels and row clicks', async () => {
    const w = mount(OvTable<Row>, {
      props: { columns, rows, sort: { key: 'name', dir: 'asc' }, manualSort: true, clickableRows: true, selectedKey: 'b', stackOnMobile: true },
      slots: { 'cell-total': '<template #cell-total="{ value }">${{ value == null ? "-" : value / 100 }}</template>' },
    });
    expect(names(w)[0]).toBe('Jasmine Carter');
    expect(w.findAll('tbody tr')[1]!.classes()).toContain('is-selected');
    expect(w.findAll('tbody tr')[0]!.findAll('td')[1]!.text()).toBe('$720');
    expect(w.findAll('tbody td')[0]!.attributes('data-label')).toBe('Customer');
    expect(w.findAll('tbody tr')[0]!.findAll('td')[2]!.attributes('data-label')).toBeUndefined();
    await w.findAll('tbody tr')[2]!.trigger('click');
    await w.findAll('tbody tr')[3]!.trigger('keydown', { key: 'Enter' });
    expect(w.emitted('row-click')!.map(([r]) => (r as Row).id)).toEqual(['c', 'd']);
  });

  it('shows the empty slot instead of the table', () => {
    const w = mount(OvTable<Row>, { props: { columns, rows: [] }, slots: { empty: '<p class="empty">No orders match</p>' } });
    expect(w.find('table').exists()).toBe(false);
    expect(w.get('.empty').text()).toBe('No orders match');
  });
});
