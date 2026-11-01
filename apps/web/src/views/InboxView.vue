<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useDebounceFn } from '@vueuse/core';
import {
  OvAlert,
  OvButton,
  OvCard,
  OvChip,
  OvConversationItem,
  OvDropdown,
  OvEmptyState,
  OvInput,
  OvMessageBubble,
  OvPageHeader,
  OvQuoteCard,
  OvSearch,
  OvSkeleton,
  OvStatus,
  OvThread,
  useToast,
} from '@oraviq/ui';
import { formatPhone, type Channel, type OrderDto } from '@oraviq/shared';
import ErrorState from '@/components/ErrorState.vue';
import OrderCard from '@/components/OrderCard.vue';
import RescheduleModal from '@/components/RescheduleModal.vue';
import { errorMessage, newIdempotencyKey } from '@/api';
import { useInboxStore, type InboxStateFilter } from '@/stores/inbox';
import { useNavStore } from '@/stores/nav';
import { useOrderActions } from '@/composables/useOrderActions';
import { channelLabel, formatDuration, formatListTime, formatWhen, messageMeta, plural } from '@/lib/format';
import { channelOptions, contactName, conversationStatus, outcomeLabel, outcomeTone } from '@/lib/status';

const inbox = useInboxStore();
const nav = useNavStore();
const route = useRoute();
const router = useRouter();
const { toast } = useToast();
const orderActions = useOrderActions();

const STATE_CHIPS: Array<[InboxStateFilter, string]> = [
  ['all', 'All'],
  ['needs_you', 'Needs you'],
  ['assistant', 'Assistant'],
  ['confirmed', 'Confirmed'],
];

const search = ref(inbox.filters.q);
const applySearch = useDebounceFn((q: string) => inbox.setFilters({ q }), 250);
watch(search, (q) => void applySearch(q));

const channels = computed<Channel[]>({
  get: () => inbox.filters.channels,
  set: (v) => void inbox.setFilters({ channels: v ?? [] }),
});
const channelOpts = computed(() => channelOptions(inbox.channelCounts, inbox.filters.channels));
const hasFilters = computed(() => inbox.filters.state !== 'all' || inbox.filters.channels.length > 0 || !!inbox.filters.q.trim());

function setState(s: InboxStateFilter) {
  void inbox.setFilters({ state: s });
}

function clearFilters() {
  search.value = '';
  void inbox.clearFilters();
  nextTick(() => (document.querySelector('.conv-tools input') as HTMLInputElement | null)?.focus());
}

const name = (c: { contact: Parameters<typeof contactName>[0]; channel?: string }) => contactName(c.contact, formatPhone, c.channel);
const routeId = computed(() => (typeof route.params.id === 'string' && route.params.id ? route.params.id : null));
const detail = computed(() => inbox.selected);
const summary = computed(() => detail.value ?? inbox.selectedSummary);
const detailStatus = computed(() => (inbox.selectedId ? inbox.detailStatus[inbox.selectedId] ?? 'loading' : 'idle'));
const takenOver = computed(() => summary.value?.aiMode === 'off' || summary.value?.aiMode === 'draft');
const replyChannel = computed(() => {
  const ch = summary.value?.channel;
  if (!ch) return '';
  return ch === 'phone' || ch === 'booking_form' ? 'text message' : channelLabel(ch).toLowerCase();
});
const contactLine = computed(() => {
  const c = summary.value?.contact;
  if (!c) return '';
  return (c.phone && formatPhone(c.phone)) || c.email || 'No number yet';
});
const history = computed(() => {
  const c = summary.value?.contact;
  if (!c) return '';
  if (c.orderCount > 0) return `${plural(c.orderCount, 'order')} since ${new Date(c.firstSeenAt).getFullYear()}`;
  return c.isRepeat ? 'Returning customer' : 'New customer';
});

/* ---------------------------------------------------------------- loading + selection */

onMounted(async () => {
  await inbox.fetch();
  if (!routeId.value && inbox.items[0]) void router.replace(`/inbox/${inbox.items[0].id}`);
});

watch(
  routeId,
  (id) => {
    if (id) void inbox.select(id);
    else inbox.selectedId = null;
  },
  { immediate: true },
);

const threadEl = ref<HTMLElement | null>(null);
const threadWrap = ref<HTMLElement | null>(null);
function scrollThread() {
  nextTick(() => {
    if (threadEl.value) threadEl.value.scrollTop = threadEl.value.scrollHeight;
  });
}
watch(() => [inbox.selectedId, detail.value?.messages.length], scrollThread);

function open(id: string) {
  void router.push(`/inbox/${id}`);
  if (window.matchMedia?.('(max-width: 900px)').matches) nextTick(() => threadWrap.value?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
}

/* ---------------------------------------------------------------- actions */

const reply = ref('');
const sending = ref(false);
// One key per reply: pressing Send again after a failure reuses it, so the customer never gets it twice.
let replyKey = newIdempotencyKey();
watch(reply, () => {
  if (!sending.value) replyKey = newIdempotencyKey();
});
const switching = ref(false);

async function setMode(mode: 'auto' | 'off') {
  const id = inbox.selectedId;
  if (!id) return;
  switching.value = true;
  try {
    await inbox.setAiMode(id, mode);
    if (mode === 'off') {
      toast('You took over. The assistant is paused in this conversation.', { action: { label: 'Undo', onClick: () => void undoMode(id, 'auto') } });
      nextTick(() => (document.getElementById('reply') as HTMLInputElement | null)?.focus());
    } else {
      toast('Handed back. The assistant answers again.', { action: { label: 'Undo', onClick: () => void undoMode(id, 'off') } });
    }
  } catch (e) {
    toast(errorMessage(e), { tone: 'danger' });
  } finally {
    switching.value = false;
  }
}

async function undoMode(id: string, mode: 'auto' | 'off') {
  try {
    await inbox.setAiMode(id, mode);
    toast('Change undone.', { tone: 'info' });
  } catch (e) {
    toast(errorMessage(e), { tone: 'danger' });
  }
}

async function send() {
  const id = inbox.selectedId;
  const body = reply.value.trim();
  if (!id || !body || sending.value) return;
  sending.value = true;
  try {
    await inbox.sendMessage(id, body, replyKey);
    reply.value = '';
    replyKey = newIdempotencyKey();
    toast(`Sent by ${replyChannel.value}.`);
  } catch (e) {
    toast(errorMessage(e), { tone: 'danger' });
  } finally {
    sending.value = false;
    nextTick(() => (document.getElementById('reply') as HTMLInputElement | null)?.focus());
  }
}

const rescheduling = ref<OrderDto | null>(null);
const rescheduleOpen = ref(false);
function openReschedule(o: OrderDto) {
  rescheduling.value = o;
  rescheduleOpen.value = true;
}
async function saveReschedule(req: Parameters<typeof orderActions.reschedule>[1]) {
  if (!rescheduling.value) return;
  const r = await orderActions.reschedule(rescheduling.value, req);
  if (r) rescheduleOpen.value = false;
}
</script>

<template>
  <OvPageHeader title="Inbox">
    <template v-if="nav.loaded">
      {{ nav.needsYou ? `${plural(nav.needsYou, 'conversation')} ${nav.needsYou === 1 ? 'needs' : 'need'} you. The assistant handled the rest.` : 'Nothing needs you right now. The assistant is handling every conversation.' }}
    </template>
    <template v-else>Every call, text and chat in one place.</template>
    <template #right><p class="demo-note">Use "Try it out" to start a new conversation.</p></template>
  </OvPageHeader>

  <OvCard as="section" padding="none" class="inbox" aria-label="Conversations">
    <div class="conv-list">
      <div class="conv-tools">
        <OvSearch v-model="search" placeholder="Search conversations" label="Search conversations by name, number or message" />
        <div class="conv-filter" role="group" aria-label="Filter">
          <OvChip v-for="[value, label] in STATE_CHIPS" :key="value" :model-value="inbox.filters.state === value" @update:model-value="setState(value)">
            {{ label }}
          </OvChip>
          <OvDropdown v-model="channels" multiple variant="filter" label="Channel" all-label="All" :searchable="false" :options="channelOpts" />
        </div>
      </div>

      <div v-if="inbox.status === 'loading' || inbox.status === 'idle'" class="skel-list" aria-busy="true" aria-label="Loading conversations">
        <OvSkeleton v-for="i in 5" :key="i" :lines="3" />
      </div>
      <div v-else-if="inbox.status === 'error'" style="padding: var(--space-4)">
        <ErrorState :message="inbox.error" @retry="inbox.fetch()" />
      </div>
      <template v-else-if="inbox.items.length">
        <OvConversationItem
          v-for="c in inbox.items"
          :key="c.id"
          :name="name(c)"
          :time="formatListTime(c.lastMessageAt)"
          :preview="c.lastMessagePreview"
          :status-label="conversationStatus(c).label"
          :status-tone="conversationStatus(c).tone"
          :tags="c.contact.isRepeat ? ['Repeat'] : []"
          :channel="c.channel"
          :selected="c.id === inbox.selectedId"
          :unread="c.unread"
          @click="open(c.id)"
        />
        <div v-if="inbox.nextCursor" class="conv-more">
          <OvButton variant="quiet" size="sm" :loading="inbox.loadingMore" @click="inbox.loadMore()">Show older conversations</OvButton>
        </div>
      </template>
      <OvEmptyState
        v-else-if="hasFilters"
        title="No conversations match"
        text="Try another channel or search, or clear the filters."
        action-label="Clear filters"
        @action="clearFilters"
      />
      <OvEmptyState v-else title="No conversations yet" icon="inbox" text="Calls, texts and chats show up here. Send one yourself from Try it out." action-label="Try it out" @action="router.push('/try')" />
    </div>

    <div ref="threadWrap" class="thread-wrap">
      <template v-if="summary">
        <div class="thread-head">
          <div>
            <b>{{ name(summary) }}</b>
            <span class="muted small"> · {{ channelLabel(summary.channel) }}<template v-if="contactLine !== name(summary)"> · {{ contactLine }}</template></span>
          </div>
          <div class="actions">
            <template v-if="takenOver">
              <OvStatus tone="info">You are replying</OvStatus>
              <OvButton variant="quiet" size="sm" :loading="switching" @click="setMode('auto')">Hand back</OvButton>
            </template>
            <OvButton v-else variant="quiet" size="sm" :loading="switching" @click="setMode('off')">Take over</OvButton>
          </div>
        </div>
        <div ref="threadEl" class="thread-scroll">
          <div v-if="detailStatus === 'loading' && !detail" class="skel-list" aria-busy="true" aria-label="Loading messages">
            <OvSkeleton :lines="2" width="70%" />
            <OvSkeleton :lines="3" width="60%" style="margin-left: auto" />
            <OvSkeleton :lines="2" width="55%" />
          </div>
          <ErrorState v-else-if="detailStatus === 'error'" :message="inbox.detailError[inbox.selectedId!] ?? null" @retry="inbox.fetchDetail(inbox.selectedId!)" />
          <OvThread v-else-if="detail" :label="`Conversation with ${name(detail)}`">
            <OvMessageBubble v-for="m in detail.messages" :key="m.id" :author="m.author" :text="m.body" :meta="messageMeta(m)" :failed="m.status === 'failed'" />
            <p v-if="!detail.messages.length" class="phone-hint">No messages yet.</p>
          </OvThread>
        </div>
        <form class="composer" @submit.prevent="send">
          <label class="sr" for="reply">Reply</label>
          <OvInput
            id="reply"
            v-model="reply"
            autocomplete="off"
            :placeholder="takenOver ? `Reply by ${replyChannel}` : 'Take over to reply yourself'"
            :disabled="!takenOver"
          />
          <OvButton type="submit" variant="primary" :disabled="!takenOver || !reply.trim()" :loading="sending">Send</OvButton>
        </form>
      </template>
      <div v-else-if="inbox.status === 'ready' && inbox.items.length" class="inbox-empty">
        <OvEmptyState title="Pick a conversation" icon="chat" text="Choose one on the left to read it and reply." />
      </div>
      <div v-else-if="inbox.status !== 'ready'" class="skel-list"><OvSkeleton :lines="4" /></div>
    </div>

    <aside class="details" aria-label="Details">
      <template v-if="detail">
        <OvAlert v-if="detail.state === 'needs_you' && detail.handoffReason" tone="needs" title="Needs you">
          {{ detail.handoffReason.replace(/\.$/, '') }}. The assistant told the customer you'll follow up.
        </OvAlert>
        <div v-if="detail.latestQuote">
          <p class="label" style="margin-bottom: 8px">Quote sent</p>
          <OvQuoteCard :quote="detail.latestQuote" />
        </div>
        <OrderCard
          v-if="detail.order"
          :order="detail.order"
          :busy="orderActions.busy.value[detail.order.id]"
          @confirm="orderActions.confirm(detail.order!)"
          @deposit="orderActions.sendDeposit(detail.order!)"
          @reschedule="openReschedule(detail.order!)"
          :can-mark-paid="orderActions.canMarkPaid(detail.order)"
          @paid="orderActions.markPaidDemo(detail.order!)"
        />
        <OvCard radius="md" label="Customer" :heading-level="3">
          <dl class="kv" style="margin-top: 8px">
            <dt>Contact</dt>
            <dd>{{ contactLine }}</dd>
            <template v-if="detail.contact.email && detail.contact.phone">
              <dt>Email</dt>
              <dd>{{ detail.contact.email }}</dd>
            </template>
            <dt>Channel</dt>
            <dd>{{ channelLabel(detail.channel) }}</dd>
            <dt>History</dt>
            <dd>{{ history }}</dd>
          </dl>
        </OvCard>
        <OvCard v-if="detail.calls.length" radius="md" label="Calls" :heading-level="3">
          <ul style="list-style: none; padding: 0; margin: 8px 0 0; display: grid; gap: 10px">
            <li v-for="call in detail.calls" :key="call.id" class="small">
              <b>{{ formatWhen(call.startedAt) }}</b> · {{ formatDuration(call.durationSeconds) }}
              <div><OvStatus :tone="outcomeTone(call.outcome)">{{ outcomeLabel(call.outcome) }}</OvStatus></div>
              <p v-if="call.summary" class="muted">{{ call.summary }}</p>
            </li>
          </ul>
        </OvCard>
      </template>
      <template v-else-if="inbox.selectedId && detailStatus === 'loading'">
        <OvSkeleton height="220" radius="lg" />
        <OvSkeleton height="160" radius="md" />
      </template>
    </aside>
  </OvCard>

  <RescheduleModal
    v-model:open="rescheduleOpen"
    :order="rescheduling"
    :busy="rescheduling ? orderActions.busy.value[rescheduling.id] === 'reschedule' : false"
    @save="saveReschedule"
  />
</template>
