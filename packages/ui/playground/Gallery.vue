<script setup lang="ts">
import { computed, ref } from 'vue';
import {
  OvAlert,
  OvButton,
  OvCard,
  OvChannelTag,
  OvCheckbox,
  OvChip,
  OvChoiceCards,
  OvConversationItem,
  OvDatePicker,
  OvDropdown,
  OvEmptyState,
  OvField,
  OvIcon,
  OvInfoTip,
  OvInput,
  OvInputGroup,
  OvKpi,
  OvKpiStrip,
  OvLogo,
  OvMessageBubble,
  OvModal,
  OvNote,
  OvPageHeader,
  OvQuoteCard,
  OvRadio,
  OvRadioGroup,
  OvSearch,
  OvSegmented,
  OvSkeleton,
  OvSpinner,
  OvStars,
  OvStatus,
  OvSwitch,
  OvTable,
  OvTabs,
  OvTextarea,
  OvThread,
  OvToaster,
  OvTooltip,
  ICON_NAMES,
  CHANNEL_META,
  addDays,
  formatDate,
  formatMoney,
  toIsoDate,
  useToast,
  type DropdownOption,
  type QuoteLike,
  type TableColumn,
  type TableSort,
} from '../src';

const sections = [
  { id: 'brand', label: 'Brand' },
  { id: 'actions', label: 'Actions' },
  { id: 'status', label: 'Status' },
  { id: 'forms', label: 'Forms' },
  { id: 'navigation', label: 'Navigation' },
  { id: 'overlays', label: 'Overlays' },
  { id: 'data', label: 'Data' },
  { id: 'conversation', label: 'Conversation' },
  { id: 'layout', label: 'Layout' },
];
const current = ref('brand');

const { toast } = useToast();

/* ---------- sample data ---------- */
const channelKeys = ['phone', 'sms', 'web_chat', 'booking_form', 'facebook', 'instagram'];
const channelOptions: DropdownOption[] = channelKeys.map((k, i) => ({
  value: k,
  label: CHANNEL_META[k]!.label,
  icon: CHANNEL_META[k]!.icon,
  count: [3, 6, 2, 1, 2, 1][i],
}));
const channels = ref<string[]>(['sms']);
const statusFilter = ref<string[]>([]);
const statusOptions: DropdownOption[] = [
  { value: 'toconfirm', label: 'To confirm', count: 3 },
  { value: 'confirmed', label: 'Confirmed', count: 1 },
  { value: 'deposit', label: 'Deposit sent', count: 1 },
];
const areas = ref<string[]>([]);
const areaOptions: DropdownOption[] = ['Atlanta', 'Decatur', 'Marietta', 'Smyrna', 'Sandy Springs', 'Roswell', 'Alpharetta', 'Dunwoody', 'Tucker', 'Kennesaw'].map(
  (c, i) => ({ value: c.toLowerCase().replace(/\s/g, '-'), label: c, count: [12, 7, 5, 4, 6, 3, 2, 4, 1, 2][i], disabled: c === 'Kennesaw' }),
);
const size = ref<string | null>('20');
const sizeOptions: DropdownOption[] = [
  { value: '10', label: '10-yard', hint: 'Bathroom remodel, small cleanout' },
  { value: '15', label: '15-yard', hint: 'Garage or basement cleanout' },
  { value: '20', label: '20-yard', hint: 'Kitchen remodel, flooring, roofing' },
  { value: '30', label: '30-yard', hint: 'Whole-home cleanout, additions' },
  { value: '40', label: '40-yard', hint: 'New construction, demolition', disabled: true },
];
const win = ref<string | null>(null);
const windowOptions: DropdownOption[] = ['Morning, 7 to 11 a.m.', 'Midday, 11 a.m. to 2 p.m.', 'Afternoon, 2 to 5 p.m.'].map((w) => ({ value: w, label: w }));
const tone = ref<string | null>('calm');

const today = new Date();
const todayIso = toIsoDate(today);
const tomorrowIso = toIsoDate(addDays(today, 1));
const delivery = ref<string | null>(toIsoDate(addDays(today, 3)));
const pickup = ref<string | null>(null);

const name = ref('Demo Roll-Off Co.');
const email = ref('');
const notes = ref('');
const extraDay = ref<string | number | null>(15);
const tons = ref<string | number | null>(3);
const q = ref('');
const agree = ref(true);
const some = ref(false);
const notify = ref(true);
const missed = ref('missed');
const answerMode = ref<string | null>('missed');
const receptionist = ref(true);
const debris = ref<string | null>('construction');

const tab = ref('widgets');
const seg = ref('right');
const view = ref('list');

/* ---------- chips ---------- */
const chip = ref<'all' | 'needs' | 'ai' | 'confirmed'>('all');

/* ---------- modal ---------- */
const modalOpen = ref(false);
const confirmOpen = ref(false);
const draftDate = ref<string | null>(delivery.value);
const draftWindow = ref<string | null>('Morning, 7 to 11 a.m.');
const draftNotify = ref(true);
function openModal() {
  draftDate.value = delivery.value;
  modalOpen.value = true;
}
function saveModal() {
  const prev = delivery.value;
  delivery.value = draftDate.value;
  modalOpen.value = false;
  toast(`Moved to ${formatDate(draftDate.value)}.${draftNotify.value ? ' Customer texted.' : ''}`, {
    action: {
      label: 'Undo',
      onClick: () => {
        delivery.value = prev;
        toast('Change undone.', { tone: 'info' });
      },
    },
  });
}

/* ---------- table ---------- */
interface OrderRow {
  id: string;
  name: string;
  channel: string;
  size: string;
  address: string;
  placement: string;
  day: string;
  total: number | null;
  status: 'toconfirm' | 'confirmed';
  deposit: boolean;
}
const orders = ref<OrderRow[]>([
  { id: 'o1', name: 'Jasmine Carter', channel: 'sms', size: '20-yard, 10 days', address: '2215 Briarwood Rd', placement: 'Driveway', day: 'Thursday', total: 72000, status: 'toconfirm', deposit: false },
  { id: 'o2', name: 'Atlanta Reno Co.', channel: 'instagram', size: '30-yard, 7 days', address: '1180 Howell Mill Rd', placement: 'Driveway', day: 'Tuesday', total: 79500, status: 'toconfirm', deposit: false },
  { id: 'o3', name: 'Tom Reyes', channel: 'sms', size: '15-yard, 5 days', address: '77 Oak Ln', placement: 'Driveway', day: 'Friday', total: 59500, status: 'confirmed', deposit: true },
  { id: 'o4', name: 'Marcus Bell (Bell Renovations)', channel: 'phone', size: '30-yard, 7 days', address: '418 Elm St', placement: 'Street', day: 'Monday', total: 79500, status: 'toconfirm', deposit: false },
]);
const columns: TableColumn<OrderRow>[] = [
  { key: 'name', label: 'Customer', sortable: true },
  { key: 'size', label: 'Dumpster' },
  { key: 'address', label: 'Deliver to', wrap: true },
  { key: 'day', label: 'Day' },
  { key: 'total', label: 'Total', align: 'right', sortable: true, sortFirst: 'desc' },
  { key: 'status', label: 'Status' },
  { key: 'actions', label: 'Actions', hideLabel: true, align: 'right' },
];
const sort = ref<TableSort | null>({ key: 'total', dir: 'desc' });
const selectedOrder = ref<string | null>('o1');
const orderQ = ref('');
const filteredOrders = computed(() =>
  orders.value.filter(
    (o) =>
      (!orderQ.value || `${o.name} ${o.address}`.toLowerCase().includes(orderQ.value.toLowerCase())) &&
      (!statusFilter.value.length || statusFilter.value.some((s) => (s === 'deposit' ? o.deposit : o.status === s))),
  ),
);
function confirmOrder(o: OrderRow) {
  o.status = 'confirmed';
  toast(`Order confirmed. ${o.name.split(' ')[0]} texted.`, { action: { label: 'Undo', onClick: () => (o.status = 'toconfirm') } });
}

/* ---------- conversation ---------- */
const quote: QuoteLike = {
  yards: 20,
  days: 10,
  totalCents: 72000,
  lineItems: [
    { code: 'base', label: 'Base, 7 days included', amountCents: 62500 },
    { code: 'extra_days', label: '3 extra days at $15', amountCents: 4500 },
    { code: 'delivery', label: 'Delivery, Zone 2', amountCents: 5000 },
  ],
  includedTons: 3,
  overagePerTonCents: 9500,
  heavyFlat: false,
};
const heavyQuote: QuoteLike = {
  yards: 10,
  days: 7,
  totalCents: 52500,
  lineItems: [
    { code: 'heavy_flat', label: 'Clean fill (concrete, dirt), flat price', amountCents: 52500 },
    { code: 'delivery', label: 'Delivery, Zone 1', amountCents: 0 },
  ],
  includedTons: null,
  overagePerTonCents: null,
  heavyFlat: true,
};
const convs = [
  { id: 'c1', name: 'Jasmine Carter', time: '6:43 p.m.', preview: 'Got it: 20-yard to 2215 Briarwood Rd, delivery Thursday, $720. I\'ve sent this to the owner to confirm the drop-off time.', statusLabel: 'Order to confirm', statusTone: 'needs' as const, channel: 'sms' },
  { id: 'c2', name: 'Dana Whitfield', time: '6:20 p.m.', preview: 'Hi Dana, this is Demo Roll-Off Co.\'s automated assistant. A 10-yard for 3 days is $425 delivered.', statusLabel: 'Quote sent', statusTone: 'neutral' as const, channel: 'facebook' },
  { id: 'c3', name: 'Marcus Bell (Bell Renovations)', time: '5:12 p.m.', preview: 'Done. I\'ve sent it to the owner to confirm the drop-off time for Monday.', statusLabel: 'Order to confirm', statusTone: 'needs' as const, channel: 'phone', tags: ['Repeat'] },
  { id: 'c4', name: 'Tom Reyes', time: 'Yesterday', preview: 'Confirmed for Friday between 8 and 11 a.m. Deposit link: pay.example/ro-1042', statusLabel: 'Confirmed', statusTone: 'confirmed' as const, channel: 'sms' },
];
const openConv = ref('c1');
const reply = ref('');
const takenOver = ref(false);
</script>

<template>
  <div class="g">
    <aside class="g-side" aria-label="Gallery">
      <OvLogo :height="32" />
      <nav aria-label="Sections">
        <ul>
          <li v-for="s in sections" :key="s.id">
            <a :href="`#${s.id}`" :aria-current="current === s.id ? 'true' : undefined" @click="current = s.id">{{ s.label }}</a>
          </li>
        </ul>
      </nav>
      <p class="g-side__foot">@oraviq/ui gallery. Every component in its main states, with sample data.</p>
    </aside>

    <main class="g-main">
      <OvPageHeader title="Component gallery" subtitle="The Oraviq design system as Vue 3 components. Everything here uses the same tokens and kit as the prototype.">
        <template #actions>
          <OvButton variant="secondary" icon="external" href="#data">Jump to data</OvButton>
        </template>
      </OvPageHeader>

      <!-- ================= Brand ================= -->
      <section id="brand" class="g-sec" aria-labelledby="h-brand">
        <h2 id="h-brand">Brand</h2>
        <div class="g-grid">
          <OvCard title="Logo">
            <div class="g-stack">
              <OvLogo :height="40" />
              <div class="g-row"><OvLogo variant="mark" :height="40" /><OvLogo variant="mono" :height="24" /></div>
            </div>
          </OvCard>
          <div class="g-night">
            <OvLogo variant="reversed" :height="32" />
            <OvLogo variant="mark-reversed" :height="32" />
          </div>
        </div>
        <OvCard title="Icons" label="One stroke set, 1.75px">
          <div class="g-icons">
            <figure v-for="n in ICON_NAMES" :key="n"><OvIcon :name="n" :size="20" /><figcaption>{{ n }}</figcaption></figure>
          </div>
        </OvCard>
      </section>

      <!-- ================= Actions ================= -->
      <section id="actions" class="g-sec" aria-labelledby="h-actions">
        <h2 id="h-actions">Actions</h2>
        <OvCard>
          <div class="g-stack">
            <div class="g-row">
              <OvButton>Confirm order</OvButton>
              <OvButton variant="signal" icon="phone">Answer now</OvButton>
              <OvButton variant="secondary">Send deposit link</OvButton>
              <OvButton variant="outline">Edit prices</OvButton>
              <OvButton variant="quiet">Take over</OvButton>
            </div>
            <div class="g-row">
              <OvButton size="sm">Confirm</OvButton>
              <OvButton size="sm" variant="secondary" icon="plus">Add size</OvButton>
              <OvButton size="sm" variant="outline">Export</OvButton>
              <OvButton size="sm" variant="quiet">Change day</OvButton>
              <OvButton loading>Saving</OvButton>
              <OvButton disabled>Send</OvButton>
              <OvButton href="https://example.com" variant="quiet" icon-end="external">Open site</OvButton>
            </div>
          </div>
        </OvCard>
      </section>

      <!-- ================= Status ================= -->
      <section id="status" class="g-sec" aria-labelledby="h-status">
        <h2 id="h-status">Status, chips and tags</h2>
        <div class="g-grid">
          <OvCard title="Status" label="A marker and a word">
            <div class="g-row">
              <OvStatus tone="needs">Needs you</OvStatus>
              <OvStatus tone="neutral">Assistant handling</OvStatus>
              <OvStatus tone="confirmed">Confirmed</OvStatus>
              <OvStatus tone="info">Repeat</OvStatus>
              <OvStatus tone="warning">Permit needed</OvStatus>
              <OvStatus tone="danger">Not delivered</OvStatus>
            </div>
          </OvCard>
          <OvCard title="Filter chips">
            <div class="g-row" role="group" aria-label="Filter">
              <OvChip :model-value="chip === 'all'" @update:model-value="chip = 'all'">All</OvChip>
              <OvChip :model-value="chip === 'needs'" :count="4" @update:model-value="chip = 'needs'">Needs you</OvChip>
              <OvChip :model-value="chip === 'ai'" @update:model-value="chip = 'ai'">Assistant</OvChip>
              <OvChip :model-value="chip === 'confirmed'" @update:model-value="chip = 'confirmed'">Confirmed</OvChip>
            </div>
          </OvCard>
          <OvCard title="Channels and ratings">
            <div class="g-stack">
              <div class="g-row"><OvChannelTag v-for="k in Object.keys(CHANNEL_META)" :key="k" :channel="k" /></div>
              <div class="g-row"><OvStars :rating="5" /><OvStars :rating="4" /><OvStars :rating="2" /> <span class="ov-chan">4.8 on Google</span></div>
            </div>
          </OvCard>
        </div>
      </section>

      <!-- ================= Forms ================= -->
      <section id="forms" class="g-sec" aria-labelledby="h-forms">
        <h2 id="h-forms">Forms</h2>
        <div class="g-grid g-grid--2">
          <OvCard title="Fields">
            <div class="g-stack">
              <OvField label="Business name" help="Shown on your free website and in texts.">
                <OvInput v-model="name" autocomplete="organization" />
              </OvField>
              <OvField label="Alert email" required error="Enter an email address, like you@company.com">
                <OvInput v-model="email" type="email" placeholder="you@company.com" />
              </OvField>
              <div class="g-row" style="align-items: flex-start">
                <OvField label="Extra day" style="flex: 1 1 160px">
                  <OvInputGroup v-model="extraDay" prefix="$" suffix="per day" type="number" inputmode="decimal" />
                </OvField>
                <OvField label="Weight included" error="Enter 0 or more" style="flex: 1 1 160px">
                  <OvInputGroup v-model="tons" suffix="tons" type="number" inputmode="decimal" />
                </OvField>
              </div>
              <OvField label="Note to the assistant" help="One or two sentences.">
                <OvTextarea v-model="notes" placeholder="We don't take mattresses in the 10-yard." :rows="3" />
              </OvField>
              <OvSearch v-model="q" placeholder="Search name or number" />
            </div>
          </OvCard>

          <OvCard title="Dropdowns and dates">
            <div class="g-stack">
              <div class="g-row">
                <OvDropdown v-model="channels" label="Channel" multiple :options="channelOptions" />
                <OvDropdown v-model="areas" label="Area" all-label="Any" multiple :options="areaOptions" />
                <OvDropdown v-model="tone" label="Tone" :options="[{ value: 'calm', label: 'Calm' }, { value: 'friendly', label: 'Friendly' }, { value: 'brief', label: 'Brief' }]" />
              </div>
              <OvField label="Dumpster size" help="The customer sees the hint under each size.">
                <OvDropdown v-model="size" variant="field" label="Dumpster size" :options="sizeOptions" />
              </OvField>
              <OvField label="Time window" error="Choose a time window">
                <OvDropdown v-model="win" variant="field" label="Time window" placeholder="Choose a window" :options="windowOptions" />
              </OvField>
              <div class="g-row" style="align-items: flex-start">
                <OvField label="Delivery day" style="flex: 1 1 200px">
                  <OvDatePicker v-model="delivery" label="Delivery day" :min="tomorrowIso" />
                </OvField>
                <OvField label="Pickup day" style="flex: 1 1 200px">
                  <OvDatePicker v-model="pickup" label="Pickup day" :min="todayIso" placeholder="Pick a day" />
                </OvField>
              </div>
              <OvDropdown v-model="win" variant="field" label="Disabled field" :options="windowOptions" disabled />
            </div>
          </OvCard>

          <OvCard title="Choices">
            <div class="g-stack">
              <div class="g-row">
                <OvCheckbox v-model="agree" label="Caller asks for a person" />
                <OvCheckbox v-model="some" label="Some" indeterminate />
                <OvSwitch v-model="receptionist" :label="receptionist ? 'On' : 'Off'" />
              </div>
              <OvCheckbox v-model="notify" label="Text Jasmine about the change" hint="The assistant sends the new day and window from your number." />
              <OvRadioGroup v-model="missed" label="Send texts" orientation="horizontal">
                <OvRadio value="missed" label="Missed calls" />
                <OvRadio value="all" label="Every call" />
                <OvRadio value="never" label="Never" disabled />
              </OvRadioGroup>
              <OvChoiceCards
                v-model="answerMode"
                label="When the receptionist answers"
                :options="[
                  { value: 'missed', title: 'Calls I miss', description: 'Rings 4 times first' },
                  { value: 'all', title: 'Every call', description: 'Answers right away' },
                ]"
              />
              <OvRadioGroup v-model="debris" label="Debris type">
                <OvRadio value="household" label="Household junk" />
                <OvRadio value="construction" label="Construction or remodel debris" />
                <OvRadio value="heavy" label="Concrete, dirt or brick" hint="Flat price, 10 and 15-yard only" />
              </OvRadioGroup>
            </div>
          </OvCard>
        </div>
      </section>

      <!-- ================= Navigation ================= -->
      <section id="navigation" class="g-sec" aria-labelledby="h-navigation">
        <h2 id="h-navigation">Navigation</h2>
        <OvCard>
          <OvTabs
            v-model="tab"
            label="Website and widgets"
            :items="[
              { value: 'site', label: 'Free website' },
              { value: 'widgets', label: 'Widgets', count: 2 },
              { value: 'domain', label: 'Domain' },
              { value: 'later', label: 'Ads', disabled: true },
            ]"
          >
            <template #default="{ value }">
              <p v-if="value === 'site'">A free website built from your prices and reviews.</p>
              <p v-else-if="value === 'widgets'">Two widgets for the site you already have: a booking form and a chat button.</p>
              <p v-else>Point your own domain at the free website.</p>
            </template>
          </OvTabs>
          <div class="g-row" style="margin-top: 24px">
            <OvSegmented v-model="seg" label="Chat button side" :options="[{ value: 'left', label: 'Left' }, { value: 'right', label: 'Right' }]" />
            <OvSegmented
              v-model="view"
              label="Show as"
              :options="[
                { value: 'list', label: 'List', icon: 'menu' },
                { value: 'calendar', label: 'Calendar', icon: 'calendar' },
              ]"
            />
          </div>
        </OvCard>
      </section>

      <!-- ================= Overlays ================= -->
      <section id="overlays" class="g-sec" aria-labelledby="h-overlays">
        <h2 id="h-overlays">Overlays</h2>
        <OvCard>
          <div class="g-row">
            <OvButton variant="primary" @click="openModal">Change delivery day</OvButton>
            <OvButton variant="outline" @click="confirmOpen = true">Remove size</OvButton>
            <OvButton variant="secondary" @click="toast('Review request texted to Priya.')">Show toast</OvButton>
            <OvButton variant="secondary" @click="toast('Order confirmed. Customer texted.', { action: { label: 'Undo', onClick: () => toast('Change undone.', { tone: 'info' }) } })">
              Toast with Undo
            </OvButton>
            <OvButton variant="quiet" @click="toast('Copy not allowed here.', { tone: 'danger' })">Danger toast</OvButton>
            <span class="g-row" style="gap: 4px">
              Included tons
              <OvInfoTip text="Weight in the base price. Anything over is charged per ton after the dump ticket." label="About included tons" />
            </span>
            <OvTooltip text="Copies the link to your booking form.">
              <OvButton variant="outline" size="sm" icon="copy">Copy link</OvButton>
            </OvTooltip>
          </div>
          <p class="ov-chan" style="margin-top: 12px">Delivery is set for {{ formatDate(delivery, true) || 'no day yet' }}.</p>
        </OvCard>

        <OvModal v-model:open="modalOpen" title="Change delivery day" subtitle="Jasmine Carter · 20-yard · 2215 Briarwood Rd">
          <OvField label="Delivery day">
            <OvDatePicker v-model="draftDate" label="Delivery day" :min="tomorrowIso" />
          </OvField>
          <OvField label="Time window">
            <OvDropdown v-model="draftWindow" variant="field" label="Time window" :options="windowOptions" />
          </OvField>
          <OvCheckbox v-model="draftNotify" label="Text Jasmine about the change" hint="The assistant sends the new day and window from your number." />
          <template #footer="{ close }">
            <OvButton variant="quiet" @click="close">Cancel</OvButton>
            <OvButton @click="saveModal">Save change</OvButton>
          </template>
        </OvModal>

        <OvModal v-model:open="confirmOpen" title="Remove the 40-yard?" subtitle="Customers can't book it until you add it back.">
          <OvNote tone="warning">2 open quotes use the 40-yard. They keep their price.</OvNote>
          <template #footer="{ close }">
            <OvButton variant="quiet" @click="close">Cancel</OvButton>
            <OvButton @click="(close(), toast('40-yard removed.', { action: { label: 'Undo', onClick: () => {} } }))">Remove size</OvButton>
          </template>
        </OvModal>
      </section>

      <!-- ================= Data ================= -->
      <section id="data" class="g-sec" aria-labelledby="h-data">
        <h2 id="h-data">Data</h2>
        <div class="ov-toolbar">
          <OvSearch v-model="orderQ" class="ov-toolbar__grow" style="max-width: 360px" placeholder="Search customer or address" label="Search orders" />
          <OvDropdown v-model="statusFilter" label="Status" multiple :options="statusOptions" />
          <OvDropdown v-model="channels" label="Channel" multiple :options="channelOptions" />
          <button v-if="orderQ || statusFilter.length" type="button" class="ov-toolbar__clear" @click="(orderQ = '', statusFilter = [])">Clear filters</button>
        </div>
        <OvTable
          v-model:sort="sort"
          :columns="columns"
          :rows="filteredOrders"
          caption="Orders"
          stack-on-mobile
          clickable-rows
          :selected-key="selectedOrder"
          @row-click="(row) => (selectedOrder = row.id)"
        >
          <template #cell-name="{ row }">
            <b>{{ row.name }}</b><br /><OvChannelTag :channel="row.channel" />
          </template>
          <template #cell-address="{ row }">
            {{ row.address }}<br /><span class="ov-chan">{{ row.placement }}{{ row.placement === 'Street' ? ' · permit check' : '' }}</span>
          </template>
          <template #cell-total="{ row }">{{ row.total == null ? '—' : formatMoney(row.total) }}</template>
          <template #cell-status="{ row }">
            <div class="g-stack" style="gap: 2px">
              <OvStatus :tone="row.status === 'confirmed' ? 'confirmed' : 'needs'">{{ row.status === 'confirmed' ? 'Confirmed' : 'To confirm' }}</OvStatus>
              <OvStatus v-if="row.deposit" tone="info">Deposit sent</OvStatus>
            </div>
          </template>
          <template #cell-actions="{ row }">
            <div class="g-row" style="gap: 4px; justify-content: flex-end; flex-wrap: nowrap">
              <OvButton v-if="row.status !== 'confirmed'" size="sm" @click.stop="confirmOrder(row)">Confirm</OvButton>
              <OvButton v-else size="sm" variant="quiet">View</OvButton>
              <OvButton size="sm" variant="quiet" @click.stop="openModal">Change day</OvButton>
            </div>
          </template>
          <template #empty>
            <OvEmptyState title="No orders match" text="Try another status or channel, or clear the filters." action-label="Clear filters" @action="(orderQ = '', statusFilter = [])" />
          </template>
        </OvTable>
        <div class="g-grid">
          <OvCard padding="none">
            <OvEmptyState title="No conversations yet" icon="inbox" text="Calls, texts and website chats appear here as they come in." />
          </OvCard>
          <OvCard title="Loading">
            <div class="g-stack">
              <div class="g-row"><OvSpinner /><span class="ov-chan">Loading orders</span></div>
              <OvSkeleton :height="20" width="60%" />
              <OvSkeleton :lines="3" />
              <div class="g-row"><OvSkeleton :width="40" :height="40" radius="circle" /><OvSkeleton :width="160" :height="36" radius="pill" /></div>
            </div>
          </OvCard>
          <div class="g-stack">
            <p class="g-h">Near the bottom of the screen the panel flips above</p>
            <div class="g-bottom-dd">
              <OvDropdown v-model="channels" label="Channel" multiple :options="channelOptions" />
            </div>
          </div>
        </div>
      </section>

      <!-- ================= Conversation ================= -->
      <section id="conversation" class="g-sec" aria-labelledby="h-conversation">
        <h2 id="h-conversation">Conversation</h2>
        <OvCard padding="none" class="g-inbox">
          <div class="g-inbox__list">
            <div class="g-inbox__tools">
              <OvSearch placeholder="Search conversations" label="Search conversations by name, number or message" />
              <div class="g-row" style="gap: 6px">
                <OvChip :model-value="chip === 'all'" @update:model-value="chip = 'all'">All</OvChip>
                <OvChip :model-value="chip === 'needs'" @update:model-value="chip = 'needs'">Needs you</OvChip>
                <OvDropdown v-model="channels" label="Channel" multiple :options="channelOptions" />
              </div>
            </div>
            <OvConversationItem
              v-for="c in convs"
              :key="c.id"
              :name="c.name"
              :time="c.time"
              :preview="c.preview"
              :status-label="c.statusLabel"
              :status-tone="c.statusTone"
              :tags="c.tags"
              :channel="c.channel"
              :selected="openConv === c.id"
              @click="openConv = c.id"
            />
          </div>
          <div class="g-inbox__thread">
            <div class="g-inbox__head">
              <div><b>Jasmine Carter</b> <span class="ov-chan">· Text message · (404) 555-0182</span></div>
              <OvStatus v-if="takenOver" tone="info">You are replying</OvStatus>
              <OvButton v-else variant="quiet" size="sm" @click="takenOver = true">Take over</OvButton>
            </div>
            <OvThread>
              <OvMessageBubble author="system" text="Missed call, 6:40 p.m. The assistant texted back." />
              <OvMessageBubble author="assistant" meta="SMS, 6:40 p.m.">Hi, this is Demo Roll-Off Co.'s automated assistant. What size dumpster do you need, and where?</OvMessageBubble>
              <OvMessageBubble author="customer" meta="SMS, 6:42 p.m.">Kitchen remodel, need a 20 yard in 30319 for like 10 days</OvMessageBubble>
              <OvMessageBubble author="assistant" meta="SMS, 6:42 p.m.">A 20-yard for 10 days is $720 delivered. It includes 3 tons, then $95 per ton over. Want me to book it?</OvMessageBubble>
              <OvMessageBubble author="owner" meta="Owner, 7:02 a.m.">Confirmed for Thursday between 8 and 11 a.m.</OvMessageBubble>
              <OvMessageBubble author="owner" meta="Owner, 7:03 a.m." failed>Deposit link: pay.example/ro-1042</OvMessageBubble>
            </OvThread>
            <form class="g-inbox__compose" @submit.prevent="reply = ''">
              <label class="ov-sr" for="g-reply">Reply</label>
              <OvInput id="g-reply" v-model="reply" :placeholder="takenOver ? 'Reply by text message' : 'Take over to reply yourself'" :disabled="!takenOver" />
              <OvButton type="submit" :disabled="!takenOver">Send</OvButton>
            </form>
          </div>
          <aside class="g-inbox__side" aria-label="Details">
            <OvAlert title="Needs you">Concrete in a 20-yard. The assistant told the customer you'll follow up.</OvAlert>
            <div>
              <p class="g-h" style="margin-bottom: 8px">Quote sent</p>
              <OvQuoteCard :quote="quote" />
            </div>
            <OvCard label="Order request" radius="md">
              <dl class="g-kv">
                <dt>Deliver to</dt><dd>2215 Briarwood Rd</dd>
                <dt>Day</dt><dd>Thursday</dd>
                <dt>Placement</dt><dd>Street</dd>
                <dt>Status</dt><dd>Waiting for you</dd>
              </dl>
              <OvNote tone="warning" style="margin-bottom: 12px">Street placement may need a city permit.</OvNote>
              <div class="g-row" style="gap: 8px">
                <OvButton>Confirm order</OvButton>
                <OvButton variant="secondary">Send deposit link</OvButton>
              </div>
            </OvCard>
          </aside>
        </OvCard>
        <div class="g-grid">
          <OvQuoteCard :quote="heavyQuote" note="Clean fill only: concrete, dirt or brick. No trash mixed in." />
          <div class="g-stack">
            <OvAlert tone="info" title="Heads up">The assistant replies by text from your business number.</OvAlert>
            <OvAlert tone="warning" title="Permit check">Street placement in Decatur needs a city permit.</OvAlert>
            <OvAlert tone="danger" title="Not delivered">The text to (404) 555-0119 failed. Try calling instead.</OvAlert>
            <OvNote>Prices come from your pricing rules, never from the AI.</OvNote>
            <OvNote tone="danger">Paint and batteries are not allowed.</OvNote>
          </div>
        </div>
      </section>

      <!-- ================= Layout ================= -->
      <section id="layout" class="g-sec" aria-labelledby="h-layout">
        <h2 id="h-layout">Layout</h2>
        <OvPageHeader title="Weekly report" subtitle="Oct 26 to Nov 1. What the assistant caught while you were on the road.">
          <template #actions>Sample data</template>
        </OvPageHeader>
        <OvKpiStrip label="This week">
          <OvKpi label="Leads after hours or missed" value="22" note="of 36 new inquiries" />
          <OvKpi label="Quotes sent" value="31" note="median reply 11 seconds" />
          <OvKpi label="Orders booked" value="13" note="9 from the assistant alone" />
          <OvKpi label="Booked value" value="$9,140" note="at your prices" />
        </OvKpiStrip>
        <OvKpiStrip :columns="3">
          <OvKpi label="Google rating" value="4.8" note="127 reviews" />
          <OvKpi label="New reviews this month" value="9" note="from 23 requests" />
          <OvKpi label="Waiting for a reply" value="2" note="drafts ready" />
        </OvKpiStrip>
        <div class="g-grid">
          <OvCard title="Linda Marsh" tone="needs">
            <template #actions><OvStars :rating="2" /></template>
            <p>Dumpster showed up 3 hours late and nobody called to say so. Price was fair, but I had a crew standing around.</p>
            <template #footer>
              <OvButton size="sm">Approve reply</OvButton>
              <OvButton size="sm" variant="quiet">Edit</OvButton>
            </template>
          </OvCard>
          <OvCard title="Setup" label="3 of 5 done">
            <p class="ov-chan" style="white-space: normal">Most haulers are live in under an hour. We do the setup with you on a call.</p>
          </OvCard>
        </div>
      </section>
    </main>
    <OvToaster />
  </div>
</template>
