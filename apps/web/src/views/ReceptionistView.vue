<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue';
import {
  OvCard,
  OvCheckbox,
  OvChoiceCards,
  OvDropdown,
  OvEmptyState,
  OvField,
  OvInput,
  OvKpi,
  OvKpiStrip,
  OvPageHeader,
  OvSkeleton,
  OvStatus,
  OvSwitch,
  OvTextarea,
  useToast,
} from '@oraviq/ui';
import { formatPhone, toE164, type CallDto, type CallOutcome, type CallSummaryDto, type ReceptionistSettingsDto } from '@oraviq/shared';
import { formatMoney } from '@oraviq/pricing';
import ErrorState from '@/components/ErrorState.vue';
import TestCallPhone from '@/components/TestCallPhone.vue';
import { api, errorMessage } from '@/api';
import { useAsync } from '@/composables/useAsync';
import { useAuthStore } from '@/stores/auth';
import { realtimeBus } from '@/lib/bus';
import { describeHours } from '@/lib/hours';
import { formatDuration, formatWhen } from '@/lib/format';
import { outcomeLabel, outcomeTone } from '@/lib/status';

const auth = useAuthStore();
const { toast } = useToast();

const settings = useAsync(() => api.receptionist.get());
const stats = useAsync(() => api.receptionist.stats());

/* ---------------------------------------------------------------- settings: each change saves */

const form = reactive({ greeting: '', transferNumber: '' });
const numberError = ref<string | undefined>();
watch(
  () => settings.data.value,
  (s) => {
    if (!s) return;
    form.greeting = s.greeting;
    form.transferNumber = s.transferNumber ? formatPhone(s.transferNumber) : '';
  },
  { immediate: true },
);

async function save(patch: Partial<ReceptionistSettingsDto>, message: string) {
  const prev = settings.data.value;
  if (!prev) return;
  settings.set({ ...prev, ...patch }); // show it right away
  try {
    settings.set(await api.receptionist.save(patch));
    toast(message);
  } catch (e) {
    settings.set(prev);
    toast(errorMessage(e), { tone: 'danger' });
  }
}

const MODE_TEXT = { all: 'Answers every call', missed: 'Answers calls you miss', after_hours: 'Answers calls after hours' } as const;
const modeOptions = computed(() => [
  { value: 'missed', title: 'Calls I miss', description: 'Your phone rings 4 times first' },
  { value: 'after_hours', title: 'Only after hours', description: describeHours(auth.tenant?.businessHours) },
  { value: 'all', title: 'Every call', description: 'Answers on the first ring' },
]);
const voiceOptions = [
  { value: 'warm', label: 'Warm', hint: 'Friendly and unhurried' },
  { value: 'clear', label: 'Clear', hint: 'Crisp and a little quicker' },
  { value: 'calm', label: 'Calm', hint: 'Low and steady' },
];

const enabled = computed({ get: () => !!settings.data.value?.enabled, set: (v: boolean) => void save({ enabled: v }, v ? 'Receptionist on.' : 'Receptionist off. Calls ring through as before.') });
const mode = computed({
  get: () => settings.data.value?.mode ?? null,
  set: (v) => v && void save({ mode: v as ReceptionistSettingsDto['mode'] }, `Saved. It now ${MODE_TEXT[v as keyof typeof MODE_TEXT].toLowerCase()}.`),
});
const voice = computed({
  get: () => settings.data.value?.voice ?? null,
  set: (v) => v && void save({ voice: v as ReceptionistSettingsDto['voice'] }, `Voice set to ${voiceOptions.find((o) => o.value === v)?.label ?? v}.`),
});
const transferAsk = computed({ get: () => !!settings.data.value?.transferWhenAsked, set: (v: boolean) => void save({ transferWhenAsked: v }, 'Transfer setting saved.') });
const transferRules = computed({
  get: () => !!settings.data.value?.transferWhenOutsideRules,
  set: (v: boolean) => void save({ transferWhenOutsideRules: v }, 'Transfer setting saved.'),
});
const spanish = computed({ get: () => !!settings.data.value?.spanish, set: (v: boolean) => void save({ spanish: v }, v ? 'It also answers in Spanish now.' : 'English only.') });

const greetingError = computed(() =>
  form.greeting.trim() && !/automated/i.test(form.greeting) ? 'Keep the words "automated" and "recorded" so callers know.' : !form.greeting.trim() ? 'Enter a greeting.' : undefined,
);
function saveGreeting() {
  const s = settings.data.value;
  if (!s || form.greeting.trim() === s.greeting || !form.greeting.trim()) return;
  void save({ greeting: form.greeting.trim() }, 'Greeting saved.');
}
function saveNumber() {
  const s = settings.data.value;
  if (!s) return;
  const raw = form.transferNumber.trim();
  const e164 = raw ? toE164(raw) : null;
  if (raw && !e164) {
    numberError.value = 'Enter a 10-digit US number, like (404) 555-0123.';
    return;
  }
  numberError.value = undefined;
  if ((e164 ?? null) === (s.transferNumber ?? null)) return;
  void save({ transferNumber: e164 }, e164 ? `Transfers go to ${formatPhone(e164)}.` : 'Transfer number removed.');
}

const forwardNote = computed(() => {
  const t = auth.tenant;
  const from = t?.phone ? formatPhone(t.phone) : 'your business line';
  const to = t?.oraviqNumber ? `your Oraviq line, ${formatPhone(t.oraviqNumber)}` : 'your Oraviq line';
  return `Calls to ${from} forward to ${to}. The voice agent runs on Retell AI.`;
});

/* ---------------------------------------------------------------- call log */

const outcomes = ref<CallOutcome[]>([]);
const allCalls = useAsync(() => api.calls.list());
const filtered = useAsync(() => (outcomes.value.length ? api.calls.list(outcomes.value) : Promise.resolve(null)), { immediate: false });
watch(outcomes, () => void filtered.run());
const calls = computed<CallSummaryDto[]>(() => (outcomes.value.length ? (filtered.data.value?.items ?? []) : (allCalls.data.value?.items ?? [])));
const outcomeOptions = computed(() => {
  const counts: Partial<Record<CallOutcome, number>> = {};
  for (const c of allCalls.data.value?.items ?? []) counts[c.outcome] = (counts[c.outcome] ?? 0) + 1;
  const keys = (Object.keys(counts) as CallOutcome[]).concat(outcomes.value.filter((o) => !counts[o]));
  return keys.map((o) => ({ value: o, label: outcomeLabel(o), count: counts[o] ?? 0 }));
});

const transcripts = ref<Record<string, CallDto | 'loading' | 'error'>>({});
async function loadTranscript(id: string, open: boolean) {
  if (!open || (transcripts.value[id] && transcripts.value[id] !== 'error')) return;
  transcripts.value[id] = 'loading';
  try {
    transcripts.value[id] = await api.calls.get(id);
  } catch {
    transcripts.value[id] = 'error';
  }
}

function reloadLog() {
  void allCalls.run();
  if (outcomes.value.length) void filtered.run();
  void stats.run();
}

const off = realtimeBus.on('call.updated', (c) => {
  const list = allCalls.data.value?.items;
  if (list) {
    const i = list.findIndex((x) => x.id === c.id);
    const next = i >= 0 ? list.map((x) => (x.id === c.id ? c : x)) : [c, ...list];
    allCalls.set({ items: next });
  }
  delete transcripts.value[c.id];
  void stats.run();
});
onBeforeUnmount(off);
</script>

<template>
  <OvPageHeader title="AI receptionist">
    Answers your business line when you can't. It quotes from your pricing rules, takes the order and texts the caller a copy. Callers always hear that it's automated.
    <template #right>
      <p v-if="settings.data.value" :class="settings.data.value.enabled ? 'live' : 'demo-note'">
        {{ settings.data.value.enabled ? MODE_TEXT[settings.data.value.mode] : 'Off' }}
      </p>
    </template>
  </OvPageHeader>

  <ErrorState v-if="stats.status.value === 'error'" :message="stats.error.value" @retry="stats.run()" />
  <OvSkeleton v-else-if="!stats.data.value" height="140" />
  <OvKpiStrip v-else label="This week">
    <OvKpi label="Calls answered this week" :value="stats.data.value.callsThisWeek" note="by the AI receptionist" />
    <OvKpi label="After hours" :value="stats.data.value.afterHours" note="calls you'd have missed" />
    <OvKpi label="Orders booked by phone" :value="stats.data.value.ordersBooked" :note="`worth ${formatMoney(stats.data.value.ordersValueCents)}`" />
    <OvKpi label="Sent to you" :value="stats.data.value.sentToYou" note="caller asked for you" />
  </OvKpiStrip>

  <div class="try">
    <div>
      <p class="label" style="margin-bottom: 10px">Try a call</p>
      <div class="phone">
        <TestCallPhone v-if="settings.data.value" :settings="settings.data.value" :business="auth.tenant?.name ?? 'Your business'" :phone="auth.tenant?.phone ?? null" @ended="reloadLog" />
        <div v-else class="phone-screen"><div class="call-idle"><OvSkeleton width="88" height="88" radius="circle" /><OvSkeleton :lines="3" width="220" /></div></div>
      </div>
    </div>

    <OvCard as="section" class="settings" aria-label="Receptionist settings">
      <ErrorState v-if="settings.status.value === 'error'" :message="settings.error.value" @retry="settings.run()" />
      <div v-else-if="!settings.data.value" class="stack"><OvSkeleton :lines="2" /><OvSkeleton height="200" /><OvSkeleton height="120" /></div>
      <template v-else>
        <div style="display: flex; justify-content: space-between; align-items: center; gap: 12px">
          <h2 class="h2">Settings</h2>
          <OvSwitch v-model="enabled" :label="enabled ? 'On' : 'Off'" />
        </div>
        <p class="small muted" style="margin-top: -12px">
          {{ forwardNote }}<template v-if="settings.data.value.voiceProvider === 'retell' && settings.data.value.agentId"> Agent {{ settings.data.value.agentId }}.</template>
        </p>
        <OvChoiceCards v-model="mode" label="When should it answer?" :options="modeOptions" />
        <OvField label="Greeting" help="Keep the automated and recording notice. Some states require every caller's consent to record." :error="greetingError">
          <OvTextarea v-model="form.greeting" :rows="3" @blur="saveGreeting" />
        </OvField>
        <OvField label="Voice" help='Retell AI voices. Turn on "Speak replies out loud" to hear a test call in your browser.'>
          <OvDropdown v-model="voice" variant="field" label="Voice" :options="voiceOptions" />
        </OvField>
        <fieldset style="border: 0; padding: 0; margin: 0; display: grid; gap: 8px">
          <legend class="label" style="color: var(--ink); margin-bottom: 8px">Put the call through to you when</legend>
          <OvCheckbox v-model="transferAsk" label="The caller asks for a person" />
          <OvCheckbox v-model="transferRules" label="The job is outside your rules" hint="Heavy debris, out of area, prohibited items" />
        </fieldset>
        <OvField label="Your cell for transfers" :error="numberError">
          <OvInput v-model="form.transferNumber" type="tel" inputmode="tel" autocomplete="tel" placeholder="(404) 555-0123" @blur="saveNumber" @keydown.enter.prevent="saveNumber" />
        </OvField>
        <OvSwitch v-model="spanish" label="Also answer in Spanish" />
      </template>
    </OvCard>
  </div>

  <OvCard as="section" padding="none" aria-label="Call log">
    <div class="card-pad">
      <h2 class="h2">Call log</h2>
      <p class="small muted">Every call gets a summary and a transcript. Your test calls are added on top.</p>
      <div class="log-tools">
        <OvDropdown v-model="outcomes" multiple variant="filter" label="Outcome" all-label="All" :searchable="false" :options="outcomeOptions" />
      </div>
    </div>
    <div v-if="allCalls.status.value === 'loading' || filtered.status.value === 'loading'" class="card-pad stack"><OvSkeleton v-for="i in 3" :key="i" :lines="3" /></div>
    <div v-else-if="allCalls.status.value === 'error'" class="card-pad"><ErrorState :message="allCalls.error.value" @retry="allCalls.run()" /></div>
    <template v-else-if="calls.length">
      <div v-for="c in calls" :key="c.id" class="call-row">
        <div>
          <b class="heading" style="font-size: 15px">{{ c.callerName || 'Unknown caller' }}</b>
          <div class="small muted">{{ formatWhen(c.startedAt) }} · {{ formatDuration(c.durationSeconds) }}{{ c.afterHours ? ' · after hours' : '' }}</div>
          <div style="margin-top: 6px"><OvStatus :tone="outcomeTone(c.outcome)">{{ outcomeLabel(c.outcome) }}</OvStatus></div>
        </div>
        <div>
          <p>{{ c.summary || 'No summary yet.' }}</p>
          <details class="transcript-toggle" @toggle="loadTranscript(c.id, ($event.target as HTMLDetailsElement).open)">
            <summary>Transcript</summary>
            <div class="transcript">
              <OvSkeleton v-if="transcripts[c.id] === 'loading'" :lines="3" />
              <p v-else-if="transcripts[c.id] === 'error'" class="muted">The transcript did not load. Close and open it to try again.</p>
              <template v-else-if="transcripts[c.id]">
                <p v-for="(l, i) in (transcripts[c.id] as CallDto).transcript" :key="i">
                  <b>{{ l.speaker === 'agent' ? 'Receptionist' : 'Caller' }}:</b> {{ l.text }}
                </p>
                <p v-if="!(transcripts[c.id] as CallDto).transcript.length" class="muted">No words were exchanged.</p>
              </template>
            </div>
          </details>
        </div>
        <div class="small muted phone-no">{{ formatPhone(c.callerNumber) }}</div>
      </div>
    </template>
    <OvEmptyState
      v-else-if="outcomes.length"
      title="No calls match"
      text="Try another outcome, or clear the filter."
      action-label="Clear filter"
      @action="outcomes = []"
    />
    <OvEmptyState v-else title="No calls yet" icon="phone" text="Calls the receptionist answers show up here with a summary. Try a call above." />
  </OvCard>
</template>
