<script setup lang="ts">
import { computed } from 'vue';
import { formatMoney, formatTons } from '../utils/format';
import type { QuoteLike } from '../utils/types';

/**
 * The quote as the one graphite card on a screen: size and period, the total first (with the light-violet diamond),
 * then every charge and the weight terms. Takes a Quote from @oraviq/pricing as is; every number comes from the engine.
 */
const props = withDefaults(
  defineProps<{
    quote: QuoteLike;
    /** Defaults to "20-yard roll-off, 10 days". */
    title?: string;
    /** Optional note under the lines, e.g. a street placement that may need a city permit. */
    note?: string;
    /** Show the included-weight and per-ton lines. */
    showWeight?: boolean;
  }>(),
  { title: undefined, note: undefined, showWeight: true },
);

const heading = computed(() => props.title ?? `${props.quote.yards}-yard roll-off, ${props.quote.days} ${props.quote.days === 1 ? 'day' : 'days'}`);
const lines = computed(() => {
  const out: Array<{ label: string; value: string }> = props.quote.lineItems.map((li) => ({
    label: li.label,
    value: li.amountCents === 0 && li.code === 'delivery' ? 'Included' : formatMoney(li.amountCents),
  }));
  if (props.showWeight) {
    const q = props.quote;
    if (q.heavyFlat) out.push({ label: 'Weight', value: 'No weight charge' });
    else {
      if (q.includedTons != null) out.push({ label: 'Weight included', value: formatTons(q.includedTons) });
      if (q.overagePerTonCents != null) out.push({ label: 'Over the included weight', value: `${formatMoney(q.overagePerTonCents)} per ton` });
    }
  }
  return out;
});
</script>

<template>
  <section class="ov-quote" :aria-label="`Quote: ${heading}, ${formatMoney(quote.totalCents)} delivered`">
    <p class="ov-quote__title">{{ heading }}</p>
    <p class="ov-quote__total"><span class="ov-sr">Total </span>{{ formatMoney(quote.totalCents) }}</p>
    <ul class="ov-quote__lines">
      <li v-for="(l, i) in lines" :key="i"><span>{{ l.label }}</span><span>{{ l.value }}</span></li>
    </ul>
    <p v-if="note || $slots.note" class="ov-quote__note"><slot name="note">{{ note }}</slot></p>
  </section>
</template>
