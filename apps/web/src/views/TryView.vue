<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import { useDebounceFn } from '@vueuse/core';
import { OvAlert, OvButton, OvCard, OvInput, OvMessageBubble, OvPageHeader, OvQuoteCard, OvSegmented, OvThread } from '@oraviq/ui';
import { formatPhone } from '@oraviq/shared';
import { findZone, formatMoney, pluralize } from '@oraviq/pricing';
import type { SimulatorChannel } from '@/api';
import { useAuthStore } from '@/stores/auth';
import { usePricingStore } from '@/stores/pricing';
import { useTryStore } from '@/stores/tryit';
import { realtimeBus } from '@/lib/bus';
import { channelLabel, formatDay, messageMeta, toDate } from '@/lib/format';
import { contactName } from '@/lib/status';

const s = useTryStore();
const auth = useAuthStore();
const pricing = usePricingStore();

onMounted(() => void pricing.load());

const channelValue = computed<string>({
  get: () => s.channel,
  set: (v) => {
    if (v !== s.channel) s.reset(v as SimulatorChannel);
  },
});
const channelOptions = [
  { value: 'sms', label: 'Text message', icon: 'chat' as const },
  { value: 'facebook', label: 'Facebook Messenger', icon: 'facebook' as const },
  { value: 'web_chat', label: 'Website chat', icon: 'globe' as const },
];

const business = computed(() => auth.tenant?.name ?? 'Your business');
const phoneHead = computed(() => {
  if (s.channel === 'sms') return [auth.tenant?.phone ? formatPhone(auth.tenant.phone) : null, 'text message'].filter(Boolean).join(' · ');
  if (s.channel === 'facebook') return 'Facebook Messenger';
  return 'Chat on your website';
});

const messages = computed(() => [...(s.detail?.messages ?? []), ...s.pending]);
const facts = computed(() => s.detail?.facts ?? {});
const quote = computed(() => s.detail?.latestQuote ?? null);
const order = computed(() => s.detail?.order ?? null);
const booking = computed(() => !!quote.value && !order.value);

const quick = computed(() =>
  booking.value || order.value
    ? ['118 Peach Ave, Friday', 'Put it on the street', 'Can I talk to a person?']
    : ['I need a dumpster', 'Not sure what size, kitchen remodel', '20 yard', '30318', '10 days', 'Construction debris', 'Can I throw out paint?', 'Concrete from a patio'],
);

const DEBRIS_SHORT = { household: 'Household', construction: 'Construction', heavy: 'Concrete or dirt' } as const;
const slots = computed(() => {
  const f = facts.value;
  const t = pricing.table;
  const zone = f.zip && t ? findZone(t, f.zip) : null;
  const items = Object.entries(f.items ?? {})
    .filter(([, n]) => n)
    .map(([k, n]) => {
      const sc = t?.surcharges.find((x) => x.key === k);
      return `${n} ${pluralize(sc?.label ?? k, n, sc?.pluralLabel)}`;
    })
    .join(', ');
  const date = f.date ? (toDate(f.date) && /^\d{4}-\d{2}-\d{2}$/.test(f.date) ? formatDay(f.date) : f.date) : '';
  return [
    { key: 'size', label: 'Size', value: f.yards ? `${f.yards}-yard` : '' },
    { key: 'zip', label: 'ZIP', value: f.zip ? `${f.zip}${t ? (zone ? ` · ${zone.name}` : ' · outside zones') : ''}` : '' },
    { key: 'days', label: 'Days', value: f.days ? `${f.days} days` : '' },
    { key: 'debris', label: 'Debris', value: f.debris ? DEBRIS_SHORT[f.debris] : '' },
    { key: 'items', label: 'Extra items', value: items },
    { key: 'address', label: 'Address', value: f.address ?? '' },
    { key: 'date', label: 'Delivery day', value: date },
    { key: 'placement', label: 'Placement', value: f.placement ? f.placement[0]!.toUpperCase() + f.placement.slice(1) : '' },
  ];
});

const customer = computed(() => (s.detail ? contactName(s.detail.contact, formatPhone, s.detail.channel) : 'the customer'));
const alerts = computed(() => {
  const d = s.detail;
  const out: Array<{ tone: 'needs' | 'info'; text: string }> = [];
  if (!d) return out;
  if (s.missedCall) out.push({ tone: 'info', text: `Missed call from ${formatPhone(s.from ?? '')}. The assistant texted back.` });
  if (quote.value)
    out.push({ tone: 'info', text: `Quote sent by ${channelLabel(s.channel).toLowerCase()}: ${quote.value.yards}-yard, ${quote.value.days} days, ${formatMoney(quote.value.totalCents)} to ${customer.value}.` });
  if (d.state === 'needs_you' && d.handoffReason) out.push({ tone: 'needs', text: `Needs you: ${d.handoffReason.replace(/\.$/, '')}. Reply from your inbox.` });
  if (order.value) {
    const q = order.value.quote;
    out.push({
      tone: 'needs',
      text: `New order: ${q ? `${q.yards}-yard` : 'dumpster'} to ${order.value.address}, ${order.value.deliveryDateLabel}${q ? `, ${formatMoney(q.totalCents)}` : ''}. Confirm it in your inbox.`,
    });
  }
  return out;
});


/* ---------------------------------------------------------------- input */

const text = ref('');
const threadEl = ref<HTMLElement | null>(null);
watch(
  () => messages.value.length,
  () => nextTick(() => threadEl.value && (threadEl.value.scrollTop = threadEl.value.scrollHeight)),
  { immediate: true },
);

async function say(t: string) {
  text.value = '';
  await s.send(t);
  nextTick(() => (document.getElementById('tinput') as HTMLInputElement | null)?.focus());
}

// Replies can also arrive later (jobs, owner replies): follow the conversation live.
const follow = useDebounceFn(() => void s.refresh().catch(() => {}), 150);
const offs = [
  realtimeBus.on('message.created', (m) => m.conversationId === s.conversationId && !s.sending && follow()),
  realtimeBus.on('conversation.updated', (c) => c.id === s.conversationId && !s.sending && follow()),
  realtimeBus.on('order.updated', (o) => o.conversationId === s.conversationId && !s.sending && follow()),
];
onBeforeUnmount(() => offs.forEach((off) => off()));
</script>

<template>
  <OvPageHeader title="Try it as a customer">
    Message the assistant like a customer would, on any channel. It quotes from your pricing rules and sends the order to your inbox. For a phone call, use
    <RouterLink to="/receptionist" class="link-btn" style="font-size: inherit">AI receptionist</RouterLink>.
    <template #actions>
      <div class="actions">
        <OvButton v-if="s.channel === 'sms'" variant="secondary" :loading="s.sending && !messages.length" @click="s.simulateMissedCall()">Simulate a missed call</OvButton>
        <OvButton variant="quiet" @click="s.reset()">Start over</OvButton>
      </div>
    </template>
  </OvPageHeader>

  <div><OvSegmented v-model="channelValue" label="Channel" :options="channelOptions" /></div>

  <div class="try">
    <div class="phone" aria-label="Customer's phone">
      <div class="phone-screen">
        <div class="phone-head">
          <b>{{ business }}</b>
          <span class="small muted">{{ phoneHead }}</span>
        </div>
        <div ref="threadEl" class="thread-scroll" style="display: flex; flex-direction: column">
          <OvThread v-if="messages.length" label="Messages with the assistant">
            <OvMessageBubble v-for="m in messages" :key="m.id" :author="m.author" :text="m.body" :meta="messageMeta(m)" :failed="m.status === 'failed'" />
            <p v-if="s.sending" class="small muted" style="align-self: flex-end">The assistant is typing</p>
          </OvThread>
          <p v-else class="phone-hint">{{ s.channel === 'sms' ? 'Send a text to start, or simulate a missed call.' : 'Send a message to start.' }}</p>
        </div>
        <div class="quick" role="group" aria-label="Example messages">
          <button v-for="q in quick" :key="q" type="button" class="ov-chip ov-chip--small" :disabled="s.sending" @click="say(q)">{{ q }}</button>
        </div>
        <form class="composer" @submit.prevent="say(text)">
          <label class="sr" for="tinput">Message</label>
          <OvInput id="tinput" v-model="text" autocomplete="off" :placeholder="s.channel === 'sms' ? 'Text message' : 'Message'" />
          <OvButton type="submit" variant="primary" :loading="s.sending" :disabled="!text.trim()">Send</OvButton>
        </form>
      </div>
    </div>

    <div class="side-panel">
      <OvAlert v-if="s.error" tone="danger" title="Not sent." live>{{ s.error }}</OvAlert>
      <section aria-labelledby="facts-h">
        <h2 id="facts-h" class="h2">What the assistant has understood</h2>
        <p class="small muted" style="margin: 4px 0 12px">Filled in from the customer's own words.</p>
        <div class="slots">
          <div v-for="slot in slots" :key="slot.key" :class="['slot', { missing: !slot.value }]">
            <span class="label">{{ slot.label }}</span>
            <b>{{ slot.value || 'Not yet' }}</b>
          </div>
        </div>
      </section>
      <section v-if="quote" style="max-width: 420px">
        <p class="label" style="margin-bottom: 8px">Quote, from your pricing rules</p>
        <OvQuoteCard :quote="quote" />
      </section>
      <OvCard v-if="alerts.length" title="Alerts to you, the owner">
        <div class="stack" style="gap: 8px; margin-top: 4px">
          <OvAlert v-for="(a, i) in alerts" :key="i" :tone="a.tone">{{ a.text }}</OvAlert>
        </div>
        <p v-if="s.conversationId" style="margin-top: 12px">
          <OvButton :as="RouterLink" :to="`/inbox/${s.conversationId}`" variant="secondary" size="sm">Open in inbox</OvButton>
        </p>
      </OvCard>
    </div>
  </div>
</template>
