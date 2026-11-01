<script setup lang="ts" generic="Row extends object">
import { computed } from 'vue';
import OvIcon from './OvIcon.vue';
import type { TableColumn, TableSort } from '../utils/types';

/**
 * A quiet table for orders, calls and price lists: hairlines between rows, muted sentence-case headers,
 * money right-aligned with tabular figures. Sortable headers set aria-sort; v-model:sort is { key, dir }.
 * Rows are sorted here unless `manualSort` (then sort them yourself, e.g. on the server).
 * Custom cells: #cell-<key>="{ row, value, index }"; headers: #header-<key>="{ column }".
 * With `stackOnMobile`, rows become cards with labels under 640px.
 */
const props = withDefaults(
  defineProps<{
    columns: TableColumn<Row>[];
    rows: Row[];
    /** Property name or function giving a stable key per row. Defaults to `id`, then the index. */
    rowKey?: string | ((row: Row, index: number) => string | number);
    /** Screen-reader caption. */
    caption?: string;
    stackOnMobile?: boolean;
    selectedKey?: string | number | null;
    /** Rows are focusable and emit row-click on click, Enter or Space. */
    clickableRows?: boolean;
    manualSort?: boolean;
    /** Text in an empty table when no #empty slot is given. */
    emptyText?: string;
  }>(),
  { rowKey: undefined, caption: undefined, selectedKey: undefined, emptyText: 'Nothing here yet.' },
);
const sort = defineModel<TableSort | null>('sort', { default: null });
const emit = defineEmits<{ 'row-click': [row: Row, index: number] }>();
defineSlots<
  {
    [key: `cell-${string}`]: ((props: { row: Row; value: unknown; index: number; column: TableColumn<Row> }) => unknown) | undefined;
  } & {
    [key: `header-${string}`]: ((props: { column: TableColumn<Row> }) => unknown) | undefined;
  } & { empty?: () => unknown }
>();

const get = (row: Row, key: string): unknown => (row as Record<string, unknown>)[key];

function keyOf(row: Row, i: number): string | number {
  if (typeof props.rowKey === 'function') return props.rowKey(row, i);
  const k = props.rowKey ?? 'id';
  const v = get(row, k);
  return typeof v === 'string' || typeof v === 'number' ? v : i;
}

function compare(a: unknown, b: unknown): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime();
  return String(a).localeCompare(String(b), 'en-US', { numeric: true, sensitivity: 'base' });
}

const view = computed(() => {
  const list = props.rows.map((row, index) => ({ row, index }));
  const s = sort.value;
  if (!s || props.manualSort) return list;
  const col = props.columns.find((c) => c.key === s.key);
  if (!col) return list;
  const val = (r: Row) => (col.sortValue ? col.sortValue(r) : get(r, col.key));
  const dir = s.dir === 'desc' ? -1 : 1;
  return [...list].sort((x, y) => {
    const a = val(x.row);
    const b = val(y.row);
    // Empty values stay last in both directions.
    if (a == null || b == null) return compare(a, b);
    return compare(a, b) * dir || x.index - y.index;
  });
});

function ariaSort(c: TableColumn<Row>) {
  if (!c.sortable || sort.value?.key !== c.key) return undefined;
  return sort.value.dir === 'asc' ? 'ascending' : 'descending';
}

function toggleSort(c: TableColumn<Row>) {
  const cur = sort.value;
  sort.value = cur?.key === c.key ? { key: c.key, dir: cur.dir === 'asc' ? 'desc' : 'asc' } : { key: c.key, dir: c.sortFirst ?? 'asc' };
}

const alignClass = (c: TableColumn<Row>) => ({ num: c.align === 'right', 'is-center': c.align === 'center', wrap: c.wrap });

function display(v: unknown): string {
  if (v == null) return '';
  return String(v);
}

function onRowKey(e: KeyboardEvent, row: Row, i: number) {
  if (!props.clickableRows || e.target !== e.currentTarget) return;
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    emit('row-click', row, i);
  }
}
</script>

<template>
  <div :class="['ov-table-wrap', { 'ov-table-wrap--stack': stackOnMobile, 'ov-table-wrap--empty': !rows.length && $slots.empty }]">
    <slot v-if="!rows.length && $slots.empty" name="empty" />
    <table v-else class="ov-table">
      <caption v-if="caption" class="ov-sr">{{ caption }}</caption>
      <thead>
        <tr>
          <th
            v-for="c in columns"
            :key="c.key"
            scope="col"
            :class="alignClass(c)"
            :style="c.width ? { width: c.width } : undefined"
            :aria-sort="ariaSort(c)"
          >
            <slot :name="`header-${c.key}`" :column="c">
              <button v-if="c.sortable" type="button" class="ov-table__sort" @click="toggleSort(c)">
                {{ c.label }}<OvIcon name="sort" :size="14" />
              </button>
              <span v-else :class="{ 'ov-sr': c.hideLabel }">{{ c.label }}</span>
            </slot>
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-if="!rows.length">
          <td :colspan="columns.length" class="ov-table__empty">{{ emptyText }}</td>
        </tr>
        <tr
          v-for="{ row, index } in view"
          :key="keyOf(row, index)"
          :class="{ 'is-selected': selectedKey != null && keyOf(row, index) === selectedKey, 'is-clickable': clickableRows }"
          :tabindex="clickableRows ? 0 : undefined"
          :aria-current="selectedKey != null && keyOf(row, index) === selectedKey ? 'true' : undefined"
          @click="clickableRows && emit('row-click', row, index)"
          @keydown="onRowKey($event, row, index)"
        >
          <td v-for="c in columns" :key="c.key" :class="alignClass(c)" v-bind="{ 'data-label': c.hideLabel ? undefined : c.label }">
            <div class="ov-table__cell">
              <slot :name="`cell-${c.key}`" :row="row" :value="get(row, c.key)" :index="index" :column="c">{{ display(get(row, c.key)) }}</slot>
            </div>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
