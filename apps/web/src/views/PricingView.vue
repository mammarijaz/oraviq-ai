<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { onBeforeRouteLeave } from 'vue-router';
import {
  OvAlert,
  OvButton,
  OvCard,
  OvDropdown,
  OvField,
  OvInfoTip,
  OvInput,
  OvInputGroup,
  OvNote,
  OvPageHeader,
  OvQuoteCard,
  OvSkeleton,
  OvSwitch,
  OvTable,
  OvTextarea,
  type TableColumn,
  useToast,
} from '@oraviq/ui';
import { calculateQuote, parseZipList, validatePriceTable, type DebrisType } from '@oraviq/pricing';
import ErrorState from '@/components/ErrorState.vue';
import { api, ApiError, errorMessage } from '@/api';
import { usePricingStore } from '@/stores/pricing';
import { fieldProblems, toDraft, toRequest, toTable, type PriceDraft } from '@/lib/priceDraft';
import { plural } from '@/lib/format';

const pricing = usePricingStore();
const { toast } = useToast();

const draft = ref<PriceDraft | null>(null);
const saved = ref('');
const problems = ref<string[]>([]);
const tried = ref(false);
const saving = ref(false);

onMounted(async () => {
  const t = await pricing.load(true);
  if (t) reset();
});

function reset() {
  if (!pricing.table) return;
  draft.value = toDraft(pricing.table);
  saved.value = JSON.stringify(toRequest(draft.value));
  problems.value = [];
  tried.value = false;
}

const dirty = computed(() => !!draft.value && JSON.stringify(toRequest(draft.value)) !== saved.value);
const fieldErrors = computed(() => (draft.value && tried.value ? fieldProblems(draft.value) : {}));
const table = computed(() => (draft.value ? toTable(draft.value, pricing.table?.version ?? 0) : null));

onBeforeRouteLeave(() => (dirty.value ? window.confirm('Leave without saving your pricing changes?') : true));

async function save() {
  if (!draft.value) return;
  tried.value = true;
  const body = toRequest(draft.value);
  // Same validator as the server (validatePriceTable), so the owner sees problems without a round trip.
  const local = validatePriceTable({ version: 0, currency: 'USD', ...body });
  if (local.length || Object.keys(fieldProblems(draft.value)).length) {
    problems.value = local.length ? local : ['Some fields need a value. They are marked below.'];
    return;
  }
  saving.value = true;
  problems.value = [];
  try {
    const t = await api.pricing.save(body);
    pricing.set(t);
    reset();
    toast(`Pricing saved. New quotes use these rules from now on.`);
  } catch (e) {
    problems.value = e instanceof ApiError && e.problems.length ? e.problems : [errorMessage(e)];
  } finally {
    saving.value = false;
  }
}

/* ---------------------------------------------------------------- sizes table */

type SizeRow = PriceDraft['sizes'][number] & { i: number };
const sizeRows = computed<SizeRow[]>(() => (draft.value?.sizes ?? []).map((s, i) => ({ ...s, i })));
const columns = computed<TableColumn<SizeRow>[]>(() => [
  { key: 'yards', label: 'Size' },
  { key: 'base', label: `Base price, ${draft.value?.includedDays || '?'} days ($)`, align: 'right' },
  { key: 'tons', label: 'Included tons', align: 'right' },
  { key: 'heavy', label: 'Concrete and dirt' },
  { key: 'flat', label: 'Clean-fill flat price ($)', align: 'right' },
]);
function setHeavy(i: number, on: boolean) {
  const s = draft.value!.sizes[i]!;
  s.heavyAllowed = on;
  if (on && !s.heavyFlat) s.heavyFlat = s.base;
}

/* ---------------------------------------------------------------- zones, items, prohibited */

function addZone() {
  const zones = draft.value!.zones;
  const n = zones.length + 1;
  let id = `z${n}`;
  while (zones.some((z) => z.id === id)) id = `${id}x`;
  zones.push({ id, name: `Zone ${n}`, fee: '0', zips: '' });
}
function removeZone(i: number) {
  draft.value!.zones.splice(i, 1);
}
const zipCount = (z: PriceDraft['zones'][number]) => parseZipList(z.zips).length;

const newWord = ref('');
function addWord() {
  const w = newWord.value.trim().toLowerCase();
  if (w && !draft.value!.prohibited.includes(w)) draft.value!.prohibited.push(w);
  newWord.value = '';
}
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/* ---------------------------------------------------------------- quote preview */

const pv = reactive({ size: '20', days: '10', zip: '30319', debris: 'construction' as DebrisType });
watch(
  () => draft.value?.sizes.map((s) => s.yards).join(),
  () => {
    const sizes = draft.value?.sizes ?? [];
    if (sizes.length && !sizes.some((s) => String(s.yards) === pv.size)) pv.size = String(sizes[Math.min(2, sizes.length - 1)]!.yards);
  },
);
const sizeOptions = computed(() => (draft.value?.sizes ?? []).filter((s) => s.active).map((s) => ({ value: String(s.yards), label: `${s.yards}-yard` })));
const debrisOptions = [
  { value: 'construction', label: 'Construction' },
  { value: 'household', label: 'Household' },
  { value: 'heavy', label: 'Concrete or dirt' },
];
const preview = computed(() => {
  if (!table.value) return null;
  if (!/^\d{5}$/.test(pv.zip.trim())) return { ok: false as const, why: 'Enter a 5-digit ZIP code to check a quote.' };
  const r = calculateQuote(table.value, { yards: Number(pv.size), days: Number(pv.days) || null, zip: pv.zip.trim(), debris: pv.debris });
  if (r.ok) return r;
  const e = r.error;
  const why: Record<string, string> = {
    zone_not_served: 'That ZIP is outside your zones, so the assistant would send it to you.',
    heavy_not_allowed: `Concrete and dirt are not allowed in this size, so the assistant would offer ${e.suggestYards?.length ? `a ${e.suggestYards.join(' or ')}-yard` : 'another size'} and send it to you.`,
    unknown_size: 'Pick a size.',
    inactive_size: 'That size is turned off.',
  };
  return { ok: false as const, why: why[e.code] ?? e.message };
});
</script>

<template>
  <OvPageHeader title="Pricing rules">
    The assistant never makes up a price. Every quote is calculated from these rules. Changes apply as soon as you save.
  </OvPageHeader>

  <ErrorState v-if="pricing.status === 'error'" :message="pricing.error" @retry="pricing.load(true).then(reset)" />
  <div v-else-if="!draft" class="pricing">
    <div class="stack"><OvSkeleton height="340" radius="lg" /><OvSkeleton height="180" radius="lg" /></div>
    <OvSkeleton height="420" radius="lg" />
  </div>

  <div v-else class="pricing">
    <div class="stack">
      <OvAlert v-if="problems.length" tone="danger" title="Not saved. Fix these first:" live>
        <ul class="problems">
          <li v-for="p in problems" :key="p">{{ p }}</li>
        </ul>
      </OvAlert>

      <OvTable :columns="columns" :rows="sizeRows" row-key="yards" caption="Prices by dumpster size">
        <template #header-tons>
          <span style="display: inline-flex; align-items: center; gap: 2px">
            Included tons
            <OvInfoTip text="Weight in the base price. Anything over is billed per ton after the landfill ticket." label="About included tons" side="bottom" />
          </span>
        </template>
        <template #header-flat>
          <span style="display: inline-flex; align-items: center; gap: 2px">
            Clean-fill flat price ($)
            <OvInfoTip text="One price for clean concrete, dirt or brick, with no weight charge." label="About the clean-fill flat price" side="bottom" />
          </span>
        </template>
        <template #cell-yards="{ row }">
          <b>{{ row.yards }}-yard</b>
        </template>
        <template #cell-base="{ row }">
          <div class="price-input">
            <OvInput
              v-model="draft.sizes[row.i]!.base"
              inputmode="decimal"
              :aria-label="`${row.yards}-yard base price`"
              :invalid="!!fieldErrors[`base${row.i}`]"
              :title="fieldErrors[`base${row.i}`]"
            />
          </div>
        </template>
        <template #cell-tons="{ row }">
          <div class="price-input">
            <OvInput v-model="draft.sizes[row.i]!.tons" inputmode="decimal" :aria-label="`${row.yards}-yard included tons`" :invalid="!!fieldErrors[`tons${row.i}`]" />
          </div>
        </template>
        <template #cell-heavy="{ row }">
          <OvSwitch :model-value="row.heavyAllowed" :aria-label="`Concrete and dirt allowed in the ${row.yards}-yard`" @update:model-value="setHeavy(row.i, $event)" />
        </template>
        <template #cell-flat="{ row }">
          <div v-if="row.heavyAllowed" class="price-input">
            <OvInput v-model="draft.sizes[row.i]!.heavyFlat" inputmode="decimal" :aria-label="`${row.yards}-yard clean-fill flat price`" :invalid="!!fieldErrors[`flat${row.i}`]" />
          </div>
          <span v-else class="muted">Not offered</span>
        </template>
      </OvTable>

      <OvCard title="Days and weight">
        <div class="form-row" style="margin-top: 16px">
          <OvField label="Days included" help="In the base price" :error="fieldErrors.includedDays">
            <OvInputGroup v-model="draft.includedDays" inputmode="numeric" suffix="days" />
          </OvField>
          <OvField label="Extra day" help="After the included days" :error="fieldErrors.extraDay">
            <OvInputGroup v-model="draft.extraDay" inputmode="decimal" prefix="$" suffix="per day" />
          </OvField>
          <OvField label="Overage" help="Billed after the landfill ticket" :error="fieldErrors.overage">
            <OvInputGroup v-model="draft.overage" inputmode="decimal" prefix="$" suffix="per ton" />
          </OvField>
          <OvField label="Longest rental" help="Longer ones go to you" :error="fieldErrors.maxDays">
            <OvInputGroup v-model="draft.maxDays" inputmode="numeric" suffix="days" />
          </OvField>
        </div>
      </OvCard>

      <OvCard title="Delivery zones">
        <div class="stack" style="gap: 16px; margin-top: 16px">
          <div v-for="(z, i) in draft.zones" :key="z.id" class="zone-row">
            <OvField :label="`${z.name} fee ($)`" :error="fieldErrors[`fee${i}`]">
              <OvInput v-model="z.fee" inputmode="decimal" />
            </OvField>
            <OvField :label="`${z.name} ZIP codes`" :help="plural(zipCount(z), 'ZIP code')" :error="fieldErrors[`zips${i}`]">
              <OvTextarea v-model="z.zips" :rows="2" />
            </OvField>
            <OvButton v-if="draft.zones.length > 1" variant="quiet" size="sm" style="margin-top: 26px" :aria-label="`Remove ${z.name}`" @click="removeZone(i)">Remove</OvButton>
          </div>
          <div class="save-bar">
            <p class="small muted">A ZIP that isn't listed goes to you instead of getting a quote.</p>
            <OvButton variant="secondary" size="sm" icon="plus" @click="addZone">Add a zone</OvButton>
          </div>
        </div>
      </OvCard>

      <OvCard title="Item fees and prohibited items">
        <div class="form-row" style="margin-top: 16px">
          <OvField v-for="(s, i) in draft.surcharges" :key="s.key" :label="cap(s.label)" :error="fieldErrors[`sur${i}`]">
            <OvInputGroup v-model="s.price" inputmode="decimal" prefix="$" suffix="each" />
          </OvField>
        </div>
        <div style="margin-top: 20px">
          <p class="label" style="color: var(--ink); margin-bottom: 8px">Prohibited (sent to you)</p>
          <ul class="tag-list" style="list-style: none; padding: 0; margin: 0 0 10px" aria-label="Prohibited words">
            <li v-for="(w, i) in draft.prohibited" :key="w" class="tag">
              {{ w }}
              <button type="button" :aria-label="`Remove ${w}`" @click="draft.prohibited.splice(i, 1)">×</button>
            </li>
          </ul>
          <form class="domain-row" style="max-width: 420px" @submit.prevent="addWord">
            <OvField label="Add a word" hide-label>
              <OvInput v-model="newWord" placeholder="Add a word, like tires or paint" />
            </OvField>
            <OvButton type="submit" variant="secondary" :disabled="!newWord.trim()">Add</OvButton>
          </form>
        </div>
      </OvCard>

      <div :class="['save-bar', 'save-sticky', { 'is-dirty': dirty }]">
        <p class="small muted" role="status">{{ dirty ? 'You have unsaved changes.' : 'All changes saved.' }}</p>
        <div class="actions">
          <OvButton v-if="dirty" variant="quiet" @click="reset">Discard changes</OvButton>
          <OvButton variant="primary" :loading="saving" :disabled="!dirty" @click="save">Save pricing</OvButton>
        </div>
      </div>
    </div>

    <aside class="sticky">
      <OvCard as="section" aria-label="Quote preview">
        <h2 class="h2">Quote preview</h2>
        <p class="small muted" style="margin: 4px 0 16px">Check a quote against your rules, saved or not.</p>
        <div class="form-row" style="grid-template-columns: 1fr 1fr; gap: 12px">
          <OvField label="Size"><OvDropdown v-model="pv.size" variant="field" label="Size" :options="sizeOptions" /></OvField>
          <OvField label="Days"><OvInput v-model="pv.days" inputmode="numeric" /></OvField>
          <OvField label="ZIP"><OvInput v-model="pv.zip" inputmode="numeric" :maxlength="5" /></OvField>
          <OvField label="Debris"><OvDropdown v-model="pv.debris" variant="field" label="Debris" :options="debrisOptions" /></OvField>
        </div>
        <div style="margin-top: 16px" aria-live="polite">
          <OvQuoteCard v-if="preview && preview.ok" :quote="preview.quote" />
          <OvNote v-else-if="preview" tone="info" style="margin: 0">{{ preview.why }}</OvNote>
        </div>
      </OvCard>
    </aside>
  </div>
</template>
