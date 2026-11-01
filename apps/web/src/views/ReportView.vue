<script setup lang="ts">
import { computed, ref } from 'vue';
import { useElementSize } from '@vueuse/core';
import { OvButton, OvCard, OvEmptyState, OvKpi, OvKpiStrip, OvPageHeader, OvSkeleton } from '@oraviq/ui';
import { CHANNEL_LABELS, type WeeklyReportDto } from '@oraviq/shared';
import { formatMoney } from '@oraviq/pricing';
import ErrorState from '@/components/ErrorState.vue';
import { api } from '@/api';
import { useAsync } from '@/composables/useAsync';
import { addDays, formatShortDate, isoDay, plural, toDate } from '@/lib/format';

/** null = the latest week; otherwise the ISO day the week ends on. */
const to = ref<string | null>(null);
const report = useAsync(() => api.reports.weekly(to.value ?? undefined));

function shift(weeks: number) {
  const end = toDate(report.data.value?.to ?? isoDay()) ?? new Date();
  const next = isoDay(addDays(end, weeks * 7));
  to.value = next >= isoDay() ? null : next;
  void report.run();
}
const isLatest = computed(() => to.value === null);

const LONG: Record<string, string> = { Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday', Thu: 'Thursday', Fri: 'Friday', Sat: 'Saturday', Sun: 'Sunday' };
/** byDay.day may be ISO dates or short names; show "Mon". */
function dayShort(d: string): string {
  const dt = /^\d{4}-\d{2}-\d{2}/.test(d) ? toDate(d.slice(0, 10)) : null;
  return dt ? dt.toLocaleDateString('en-US', { weekday: 'short' }) : d.slice(0, 3);
}
const dayLong = (d: string) => LONG[dayShort(d)] ?? d;

const range = computed(() => (report.data.value ? `${formatShortDate(report.data.value.from)} to ${formatShortDate(report.data.value.to)}` : ''));

/* ---------------------------------------------------------------- inquiries vs orders */

function niceMax(n: number) {
  if (n <= 4) return 4;
  const steps = [5, 8, 10, 12, 15, 20, 25, 30, 40, 50, 60, 80, 100, 150, 200, 250, 300, 400, 500, 1000];
  return steps.find((s) => s >= n) ?? Math.ceil(n / 100) * 100;
}

const chartBox = ref<HTMLElement | null>(null);
const { width: boxWidth } = useElementSize(chartBox);
const chart = computed(() => {
  const r = report.data.value;
  if (!r) return null;
  const days = r.byDay;
  const max = niceMax(Math.max(1, ...days.map((d) => Math.max(d.inquiries, d.orders))));
  // Draw at the container's own width so axis labels stay 12px on phones.
  const W = Math.round(Math.min(760, Math.max(300, boxWidth.value || 640)));
  const H = 220;
  const top = 30;
  const base = 180;
  const span = base - top;
  const gap = (W - 60) / Math.max(1, days.length);
  const bw = Math.min(28, gap / 2 - 6);
  const ticks = [0, 1, 2, 3, 4].map((i) => Math.round((max / 4) * i));
  return {
    W,
    H,
    ticks: ticks.map((v) => ({ v, y: base - (v / max) * span })),
    bars: days.map((d, i) => {
      const x = 50 + i * gap + (gap - (bw * 2 + 4)) / 2;
      const h1 = (d.inquiries / max) * span;
      const h2 = (d.orders / max) * span;
      return { key: d.day, label: dayShort(d.day), x, bw, y1: base - h1, h1, y2: base - h2, h2, inquiries: d.inquiries, orders: d.orders };
    }),
  };
});

function dayHeadline(r: WeeklyReportDto): string {
  const sorted = [...r.byDay].sort((a, b) => b.inquiries - a.inquiries);
  const [a, b] = sorted;
  if (!a || a.inquiries === 0) return 'No new inquiries this week yet';
  if (!b || b.inquiries === 0) return `${dayLong(a.day)} brought the most inquiries; the assistant booked ${plural(a.orders, 'order')} that day`;
  const both = a.orders + b.orders;
  const [first, second] = r.byDay.indexOf(a) < r.byDay.indexOf(b) ? [a, b] : [b, a];
  return `${dayLong(first.day)} and ${dayLong(second.day)} brought the most inquiries; the assistant booked ${plural(both, 'order')} those two days`;
}

/* ---------------------------------------------------------------- by channel */

const channels = computed(() => {
  const r = report.data.value;
  if (!r) return [];
  const max = Math.max(1, ...r.byChannel.map((c) => c.count));
  return r.byChannel.filter((c) => c.count > 0 || ['phone', 'sms'].includes(c.channel)).map((c) => ({ ...c, label: CHANNEL_LABELS[c.channel], pct: (c.count / max) * 100 }));
});
function channelHeadline(r: WeeklyReportDto): string {
  const total = r.byChannel.reduce((s, c) => s + c.count, 0);
  if (!total) return 'Leads by channel show up here once inquiries come in';
  const sorted = [...r.byChannel].sort((a, b) => b.count - a.count);
  const lead = sorted[1] && sorted[1].count ? `${CHANNEL_LABELS[sorted[0]!.channel]} and ${CHANNEL_LABELS[sorted[1].channel].toLowerCase()} brought the most leads` : `${CHANNEL_LABELS[sorted[0]!.channel]} brought the most leads`;
  const phone = r.byChannel.find((c) => c.channel === 'phone')?.count ?? 0;
  const answered = r.receptionistAnswered;
  if (!answered) return lead;
  // "answered 9 of the 21" only reads right when the counts line up; otherwise just say how many it answered.
  return answered <= phone ? `${lead}; the AI receptionist answered ${answered} of ${plural(phone, 'call')}` : `${lead}; the AI receptionist answered ${plural(answered, 'call')}`;
}
const totalLeads = computed(() => report.data.value?.byChannel.reduce((s, c) => s + c.count, 0) ?? 0);
</script>

<template>
  <OvPageHeader title="Weekly report">
    <template v-if="report.data.value">{{ range }}. What the assistant caught while you were on the road.</template>
    <template v-else>What the assistant caught while you were on the road.</template>
    <template #actions>
      <div class="actions">
        <OvButton variant="quiet" size="sm" icon="chevronLeft" :disabled="!report.data.value" @click="shift(-1)">Previous week</OvButton>
        <OvButton variant="quiet" size="sm" icon-end="chevronRight" :disabled="isLatest" @click="shift(1)">Next week</OvButton>
      </div>
    </template>
  </OvPageHeader>

  <ErrorState v-if="report.status.value === 'error'" :message="report.error.value" @retry="report.run()" />
  <template v-else-if="!report.data.value">
    <OvSkeleton height="140" />
    <OvSkeleton height="320" radius="lg" />
    <OvSkeleton height="260" radius="lg" />
  </template>
  <template v-else>
    <OvKpiStrip label="This week in numbers">
      <OvKpi label="Leads after hours or missed" :value="report.data.value.leadsAfterHoursOrMissed" :note="`of ${plural(report.data.value.newInquiries, 'new inquiry', 'new inquiries')}`" />
      <OvKpi
        label="Quotes sent"
        :value="report.data.value.quotesSent"
        :note="report.data.value.medianReplySeconds != null ? `median reply ${plural(Math.round(report.data.value.medianReplySeconds), 'second')}` : 'no replies yet'"
      />
      <OvKpi label="Orders booked" :value="report.data.value.ordersBooked" :note="`${report.data.value.ordersByAssistant} from the assistant alone`" />
      <OvKpi label="Booked value" :value="formatMoney(report.data.value.bookedValueCents)" note="at your prices" />
    </OvKpiStrip>

    <OvCard as="section" aria-labelledby="chart-h">
      <h2 id="chart-h" class="h2">{{ dayHeadline(report.data.value) }}</h2>
      <p class="legend" aria-hidden="true">
        <span><i style="background: var(--secondary-line)" />New inquiries</span>
        <span><i style="background: var(--ink)" />Orders booked</span>
      </p>
      <div ref="chartBox" style="width: 100%; max-width: 760px">
      <svg v-if="chart" class="chart" :viewBox="`0 0 ${chart.W} ${chart.H}`" role="img" aria-label="New inquiries and orders booked by day. The same numbers are in the table below.">
        <g v-for="t in chart.ticks" :key="t.v">
          <line x1="40" :x2="chart.W - 10" :y1="t.y" :y2="t.y" stroke="var(--line)" />
          <text x="32" :y="t.y + 4" text-anchor="end" font-size="12" fill="var(--ink-muted)">{{ t.v }}</text>
        </g>
        <g v-for="b in chart.bars" :key="b.key">
          <rect :x="b.x" :y="b.y1" :width="b.bw" :height="Math.max(0, b.h1)" rx="4" fill="var(--secondary-line)">
            <title>{{ b.label }}: {{ plural(b.inquiries, 'inquiry', 'inquiries') }}</title>
          </rect>
          <rect :x="b.x + b.bw + 4" :y="b.y2" :width="b.bw" :height="Math.max(0, b.h2)" rx="4" fill="var(--ink)">
            <title>{{ b.label }}: {{ plural(b.orders, 'order') }}</title>
          </rect>
          <text :x="b.x + b.bw + 2" y="200" text-anchor="middle" font-size="12" fill="var(--ink-muted)">{{ b.label }}</text>
        </g>
      </svg>
      </div>
      <table class="sr-only">
        <caption>New inquiries and orders booked by day</caption>
        <thead>
          <tr><th scope="col">Day</th><th scope="col">New inquiries</th><th scope="col">Orders booked</th></tr>
        </thead>
        <tbody>
          <tr v-for="d in report.data.value.byDay" :key="d.day">
            <th scope="row">{{ dayLong(d.day) }}</th>
            <td>{{ d.inquiries }}</td>
            <td>{{ d.orders }}</td>
          </tr>
        </tbody>
      </table>
    </OvCard>

    <OvCard as="section" aria-labelledby="chan-h">
      <h2 id="chan-h" class="h2">{{ channelHeadline(report.data.value) }}</h2>
      <p class="small muted" style="margin: 4px 0 12px">New inquiries by channel, {{ totalLeads }} in total</p>
      <OvEmptyState v-if="!channels.length" title="No leads yet" icon="chart" text="Leads by channel show up here." />
      <div v-for="c in channels" :key="c.channel" class="hbar">
        <span>{{ c.label }}</span>
        <span class="track" aria-hidden="true"><span class="fill" :style="{ width: `${c.pct}%` }" /></span>
        <span class="v"><span class="sr">{{ c.label }}: </span>{{ c.count }}</span>
      </div>
    </OvCard>
  </template>
</template>
