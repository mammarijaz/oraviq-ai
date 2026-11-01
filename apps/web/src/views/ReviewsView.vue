<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue';
import {
  OvAlert,
  OvButton,
  OvCard,
  OvChannelTag,
  OvChip,
  OvDropdown,
  OvEmptyState,
  OvField,
  OvIcon,
  OvKpi,
  OvKpiStrip,
  OvPageHeader,
  OvSkeleton,
  OvStars,
  OvStatus,
  OvSwitch,
  OvTextarea,
  useToast,
} from '@oraviq/ui';
import { formatPhone, type ReviewDto, type ReviewRequestJobDto, type ReviewSource, type ReviewStatsDto } from '@oraviq/shared';
import ErrorState from '@/components/ErrorState.vue';
import { api, errorMessage } from '@/api';
import { useAsync } from '@/composables/useAsync';
import { useNavStore } from '@/stores/nav';
import { realtimeBus } from '@/lib/bus';
import { firstName, formatAgo, formatTime, plural } from '@/lib/format';

const nav = useNavStore();
const { toast } = useToast();

type ReplyFilter = 'all' | 'needs' | 'replied';
const replyFilter = ref<ReplyFilter>('all');
const sources = ref<ReviewSource[]>([]);
const ratings = ref<string[]>([]);
const hasFilters = computed(() => replyFilter.value !== 'all' || sources.value.length > 0 || ratings.value.length > 0);

/** Unfiltered list: stats and counts. Filtered list: what is shown when a filter is on. */
const all = useAsync(() => api.reviews.list());
const filtered = useAsync(
  () =>
    hasFilters.value
      ? api.reviews.list({
          replied: replyFilter.value === 'all' ? undefined : replyFilter.value === 'replied',
          source: sources.value,
          rating: ratings.value.map(Number),
        })
      : Promise.resolve(null),
  { immediate: false },
);
watch([replyFilter, sources, ratings], () => void filtered.run());

const items = computed<ReviewDto[]>(() => (hasFilters.value ? (filtered.data.value?.items ?? []) : (all.data.value?.items ?? [])));
const stats = computed<ReviewStatsDto | null>(() => all.data.value?.stats ?? null);
const loading = computed(() => all.status.value === 'loading' || (hasFilters.value && filtered.status.value === 'loading'));
watch(stats, (s) => s && nav.setReviewsWaiting(s.waitingForReply));

const sourceOptions = computed(() =>
  (['google', 'facebook'] as const).map((s) => ({
    value: s,
    label: s === 'google' ? 'Google' : 'Facebook',
    count: (all.data.value?.items ?? []).filter((r) => r.source === s).length,
    icon: s === 'google' ? ('star' as const) : ('facebook' as const),
  })),
);
const ratingOptions = computed(() =>
  [5, 4, 3, 2, 1].map((n) => ({ value: String(n), label: `${n} ${n === 1 ? 'star' : 'stars'}`, count: (all.data.value?.items ?? []).filter((r) => r.rating === n).length })),
);

function clearFilters() {
  replyFilter.value = 'all';
  sources.value = [];
  ratings.value = [];
}

/* ---------------------------------------------------------------- replies */

const drafts = reactive<Record<string, string>>({});
const busy = reactive<Record<string, 'post' | 'draft' | undefined>>({});
const draftOf = (r: ReviewDto) => drafts[r.id] ?? r.draft ?? '';

function replace(r: ReviewDto) {
  for (const list of [all, filtered]) {
    const d = list.data.value;
    if (d) list.set({ ...d, items: d.items.map((x) => (x.id === r.id ? r : x)) });
  }
}

async function post(r: ReviewDto) {
  const text = draftOf(r).trim();
  if (!text) {
    toast('Write a reply first.', { tone: 'info' });
    return;
  }
  busy[r.id] = 'post';
  try {
    const updated = await api.reviews.reply(r.id, text);
    replace(updated);
    delete drafts[r.id];
    const d = all.data.value;
    if (d && !r.reply) all.set({ ...d, stats: { ...d.stats, waitingForReply: Math.max(0, d.stats.waitingForReply - 1) } });
    toast(`Reply posted to ${r.source === 'google' ? 'Google' : 'Facebook'}.`);
  } catch (e) {
    toast(errorMessage(e), { tone: 'danger' });
  } finally {
    busy[r.id] = undefined;
  }
}

async function redraft(r: ReviewDto) {
  busy[r.id] = 'draft';
  try {
    const updated = await api.reviews.draft(r.id);
    delete drafts[r.id];
    replace(updated);
    toast('New draft ready.', { tone: 'info' });
  } catch (e) {
    toast(errorMessage(e), { tone: 'danger' });
  } finally {
    busy[r.id] = undefined;
  }
}

/* ---------------------------------------------------------------- review requests */

const requests = useAsync(() => api.reviews.requests());
const template = ref('');
const templateError = ref<string | undefined>();
watch(
  () => requests.data.value?.settings.template,
  (t) => {
    if (t != null) template.value = t;
  },
  { immediate: true },
);
const delayText = computed(() => {
  const m = requests.data.value?.settings.delayMinutes ?? 120;
  return m % 60 === 0 ? plural(m / 60, 'hour') : plural(m, 'minute');
});
const previewName = computed(() => firstName(requests.data.value?.jobs[0]?.customerName) || 'Priya');
const preview = computed(() => template.value.replace(/\{first name\}/gi, previewName.value));

async function saveRequests(patch: { enabled?: boolean; template?: string }, message: string) {
  const prev = requests.data.value;
  if (!prev) return;
  requests.set({ ...prev, settings: { ...prev.settings, ...patch } });
  try {
    const s = await api.reviews.saveRequests(patch);
    requests.set({ ...requests.data.value!, settings: s });
    toast(message);
  } catch (e) {
    requests.set(prev);
    toast(errorMessage(e), { tone: 'danger' });
  }
}

const autoSend = computed({
  get: () => !!requests.data.value?.settings.enabled,
  set: (v: boolean) => void saveRequests({ enabled: v }, v ? 'Review requests on.' : 'Review requests off. Nothing is sent automatically.'),
});

function saveTemplate() {
  const t = template.value.trim();
  if (!t) {
    templateError.value = 'Enter the message customers get.';
    return;
  }
  templateError.value = undefined;
  if (t === requests.data.value?.settings.template) return;
  void saveRequests({ template: t }, 'Message saved.');
}

const sending = reactive<Record<string, boolean>>({});
async function sendNow(j: ReviewRequestJobDto) {
  sending[j.orderId] = true;
  try {
    const updated = await api.reviews.sendRequest(j.orderId);
    const d = requests.data.value!;
    requests.set({ ...d, jobs: d.jobs.map((x) => (x.orderId === j.orderId ? updated : x)) });
    toast(`Review request texted to ${firstName(j.customerName) || 'the customer'}.`);
  } catch (e) {
    toast(errorMessage(e), { tone: 'danger' });
  } finally {
    sending[j.orderId] = false;
  }
}

const off = realtimeBus.on('review.created', () => {
  void all.run();
  if (hasFilters.value) void filtered.run();
});
onBeforeUnmount(off);
</script>

<template>
  <OvPageHeader title="Reviews">
    <template v-if="stats">
      {{ stats.waitingForReply ? `${plural(stats.waitingForReply, 'review')} ${stats.waitingForReply === 1 ? 'needs' : 'need'} a reply.` : 'Every review has a reply.' }}
      The assistant drafts each reply; nothing is posted until you approve it.
    </template>
    <template v-else>The assistant drafts each reply; nothing is posted until you approve it.</template>
  </OvPageHeader>

  <ErrorState v-if="all.status.value === 'error'" :message="all.error.value" @retry="all.run()" />
  <OvSkeleton v-else-if="!stats" height="140" />
  <OvKpiStrip v-else label="Reviews">
    <OvKpi label="Google rating" :value="stats.googleRating != null ? stats.googleRating.toFixed(1) : '—'" :note="plural(stats.googleCount, 'review')" />
    <OvKpi label="Facebook" :value="stats.facebookRecommendPct != null ? `${stats.facebookRecommendPct}%` : '—'" :note="`recommend you, ${plural(stats.facebookCount, 'review')}`" />
    <OvKpi label="New reviews this month" :value="stats.newThisMonth" :note="`from ${plural(stats.requestsThisMonth, 'request')}`" />
    <OvKpi label="Waiting for a reply" :value="stats.waitingForReply" note="drafts ready" />
  </OvKpiStrip>

  <div class="rv-grid">
    <div class="rv-list">
      <div class="rv-tools">
        <div role="group" aria-label="Filter by reply">
          <OvChip
            v-for="[v, l] in ([['all', 'All'], ['needs', 'Needs a reply'], ['replied', 'Replied']] as const)"
            :key="v"
            :model-value="replyFilter === v"
            @update:model-value="replyFilter = v"
          >
            {{ l }}
          </OvChip>
        </div>
        <div>
          <OvDropdown v-model="sources" multiple variant="filter" label="Source" all-label="All" :searchable="false" :options="sourceOptions" />
          <OvDropdown v-model="ratings" multiple variant="filter" label="Rating" all-label="Any" :searchable="false" :options="ratingOptions" />
        </div>
      </div>

      <template v-if="loading">
        <OvSkeleton v-for="i in 3" :key="i" height="220" radius="lg" />
      </template>
      <ErrorState v-else-if="hasFilters && filtered.status.value === 'error'" :message="filtered.error.value" @retry="filtered.run()" />
      <template v-else-if="items.length">
        <OvCard v-for="r in items" :key="r.id" as="article" :tone="!r.reply && r.needsCall ? 'needs' : 'default'" class="review">
          <div class="review-top">
            <div>
              <p class="review-name">{{ r.author }}</p>
              <p style="margin-top: 2px">
                <OvChannelTag :channel="r.source" :label="r.source === 'google' ? 'Google' : 'Facebook'" />
                <span class="small muted"> · {{ formatAgo(r.createdAt) }}</span>
              </p>
            </div>
            <div>
              <span v-if="r.source === 'facebook' && r.rating == null" class="rec">
                <span class="rec-check" aria-hidden="true"><OvIcon name="check" :size="12" /></span>
                {{ r.recommends === false ? "Doesn't recommend" : 'Recommends' }}
              </span>
              <OvStars v-else-if="r.rating != null" :rating="r.rating" />
            </div>
          </div>
          <p>{{ r.text }}</p>
          <div v-if="r.reply" class="reply-box">
            <p class="label" style="margin-bottom: 4px">Your reply, posted</p>
            <p class="small">{{ r.reply }}</p>
          </div>
          <template v-else>
            <OvAlert v-if="r.needsCall" tone="needs">
              <b>Needs you.</b>
              {{ r.rating != null ? `A ${r.rating}-star review.` : 'An unhappy review.' }}
              <template v-if="r.customerPhone">Consider calling {{ firstName(r.author) }} at {{ formatPhone(r.customerPhone) }} before you reply in public.</template>
              <template v-else>Consider calling {{ firstName(r.author) }} before you reply in public.</template>
            </OvAlert>
            <OvField label="Draft reply, written by the assistant">
              <OvTextarea :model-value="draftOf(r)" :rows="3" @update:model-value="drafts[r.id] = String($event ?? '')" />
            </OvField>
            <div class="actions">
              <OvButton variant="primary" size="sm" :loading="busy[r.id] === 'post'" @click="post(r)">Post reply</OvButton>
              <OvButton variant="quiet" size="sm" :loading="busy[r.id] === 'draft'" @click="redraft(r)">Try another draft</OvButton>
            </div>
          </template>
        </OvCard>
      </template>
      <OvCard v-else-if="hasFilters">
        <OvEmptyState title="No reviews match" text="Try another source or rating, or clear the filters." action-label="Clear filters" @action="clearFilters" />
      </OvCard>
      <OvCard v-else>
        <OvEmptyState title="No reviews yet" icon="star" text="Connect your Google Business Profile in Setup, and turn on review requests so happy customers leave one." />
      </OvCard>
    </div>

    <OvCard as="section" class="settings" aria-label="Review requests">
      <h2 class="h2">Review requests</h2>
      <ErrorState v-if="requests.status.value === 'error'" :message="requests.error.value" @retry="requests.run()" />
      <div v-else-if="!requests.data.value" class="stack"><OvSkeleton :lines="2" /><OvSkeleton height="120" /><OvSkeleton :lines="4" /></div>
      <template v-else>
        <OvSwitch v-model="autoSend" :label="`Text a review request ${delayText} after pickup`" />
        <OvField label="Message" help="{first name} is filled in for each customer. Customers who replied STOP are skipped." :error="templateError">
          <OvTextarea v-model="template" :rows="4" @blur="saveTemplate" />
        </OvField>
        <div>
          <p class="label" style="margin-bottom: 6px">Preview</p>
          <div class="sms-preview" aria-live="polite">{{ preview }}</div>
        </div>
        <div>
          <p class="label">Recent jobs</p>
          <p v-if="!requests.data.value.jobs.length" class="small muted" style="margin-top: 6px">Picked-up orders show up here.</p>
          <div v-for="j in requests.data.value.jobs" :key="j.orderId" class="job">
            <div>
              <b style="font-weight: 600">{{ j.customerName }}</b>
              <div class="small muted">{{ j.jobLabel }}</div>
            </div>
            <div style="text-align: right">
              <template v-if="j.status === 'ready'">
                <OvButton variant="secondary" size="sm" :loading="sending[j.orderId]" @click="sendNow(j)">Send now</OvButton>
                <div v-if="autoSend && j.sendAt" class="small muted" style="margin-top: 4px">or sends at {{ formatTime(j.sendAt) }}</div>
              </template>
              <OvStatus v-else-if="j.status === 'scheduled'">{{ j.sendAt ? `Sends at ${formatTime(j.sendAt)}` : 'After pickup' }}</OvStatus>
              <OvStatus v-else-if="j.status === 'sent'" tone="info">Request sent</OvStatus>
              <OvStatus v-else-if="j.status === 'reviewed'" tone="confirmed">Reviewed</OvStatus>
              <OvStatus v-else tone="info">Skipped</OvStatus>
            </div>
          </div>
        </div>
      </template>
    </OvCard>
  </div>
</template>
