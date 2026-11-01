<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import { OvButton, OvInput, OvSwitch, useToast } from '@oraviq/ui';
import { formatPhone, type ReceptionistSettingsDto } from '@oraviq/shared';
import { api, errorMessage } from '@/api';
import { formatDuration, initials } from '@/lib/format';

/** "Try a call": you play the caller, the receptionist answers through POST /receptionist/test-call. */
const props = defineProps<{ settings: ReceptionistSettingsDto; business: string; phone: string | null }>();
const emit = defineEmits<{ ended: [callId: string | null] }>();
const { toast } = useToast();

type Line = { who: 'them' | 'me' | 'system'; text: string };
const phase = ref<'idle' | 'live' | 'ended'>('idle');
const lines = ref<Line[]>([]);
const callId = ref<string | null>(null);
const conversationId = ref<string | null>(null);
const summary = ref<string | null>(null);
const transferredTo = ref<string | null>(null);
const startedAt = ref(0);
const elapsed = ref(0);
const busy = ref(false);
const text = ref('');
const speakAloud = ref(false);
let timer: ReturnType<typeof setInterval> | null = null;

const canSpeak = typeof window !== 'undefined' && 'speechSynthesis' in window;
function speak(t: string) {
  if (!speakAloud.value || !canSpeak) return;
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(t);
    u.rate = props.settings.voice === 'clear' ? 1.1 : props.settings.voice === 'calm' ? 0.95 : 1.02;
    if (props.settings.spanish && /[¿¡ñ]/.test(t)) u.lang = 'es-US';
    window.speechSynthesis.speak(u);
  } catch {
    /* speech not available */
  }
}
watch(speakAloud, (on) => {
  if (!on && canSpeak) window.speechSynthesis.cancel();
});

const lineEl = ref<HTMLElement | null>(null);
watch(
  () => lines.value.length,
  () => nextTick(() => lineEl.value && (lineEl.value.scrollTop = lineEl.value.scrollHeight)),
);

function start() {
  phase.value = 'live';
  lines.value = [{ who: 'them', text: props.settings.greeting }];
  callId.value = null;
  conversationId.value = null;
  summary.value = null;
  transferredTo.value = null;
  startedAt.value = Date.now();
  elapsed.value = 0;
  timer = setInterval(() => (elapsed.value = Math.round((Date.now() - startedAt.value) / 1000)), 1000);
  speak(props.settings.greeting);
  nextTick(() => (document.getElementById('call-input') as HTMLInputElement | null)?.focus());
}

async function say(t: string) {
  const said = t.trim();
  if (!said || busy.value || phase.value !== 'live') return;
  text.value = '';
  lines.value.push({ who: 'me', text: said });
  busy.value = true;
  try {
    const r = await api.receptionist.testCall({ callId: callId.value ?? undefined, text: said });
    callId.value = r.callId;
    const replies = r.replies.filter((x, i) => !(i === 0 && lines.value.length === 2 && x === props.settings.greeting));
    for (const reply of replies) lines.value.push({ who: 'them', text: reply });
    speak(replies.join(' '));
    if (r.transferredTo) transferredTo.value = r.transferredTo;
    if (r.summary) summary.value = r.summary;
    if (r.ended) await finish();
  } catch (e) {
    lines.value.push({ who: 'system', text: errorMessage(e) });
  } finally {
    busy.value = false;
    nextTick(() => (document.getElementById('call-input') as HTMLInputElement | null)?.focus());
  }
}

/** End call: tell the API to hang up (it writes the summary), then wrap up here. */
async function hangUp() {
  if (phase.value !== 'live') return;
  if (callId.value) {
    busy.value = true;
    try {
      const r = await api.receptionist.testCall({ callId: callId.value, text: '', end: true });
      if (r.summary) summary.value = r.summary;
      if (r.transferredTo) transferredTo.value = r.transferredTo;
    } catch {
      /* already ended on the server, or offline: the call log reload shows the truth */
    } finally {
      busy.value = false;
    }
  }
  await finish();
}

async function finish() {
  if (phase.value === 'ended') return;
  phase.value = 'ended';
  if (timer) clearInterval(timer);
  timer = null;
  if (canSpeak && !transferredTo.value) window.speechSynthesis.cancel();
  if (callId.value) {
    try {
      const c = await api.calls.get(callId.value);
      conversationId.value = c.conversationId;
      summary.value = summary.value ?? c.summary;
      if (c.durationSeconds) elapsed.value = c.durationSeconds;
    } catch {
      /* the summary from the last turn is enough */
    }
  }
  if (!summary.value) summary.value = callId.value ? 'Short call, no request taken.' : 'You hung up before saying anything.';
  toast(transferredTo.value ? `Call put through to ${formatPhone(transferredTo.value)}.` : 'Test call ended. The summary is in the call log.');
  emit('ended', callId.value);
}

onBeforeUnmount(() => {
  if (timer) clearInterval(timer);
  if (canSpeak) window.speechSynthesis.cancel();
});

const chips = ['I need a dumpster for a kitchen remodel', '20 yard please', "It's in 30319", 'About 10 days', '2215 Briarwood Rd, Thursday', 'Can I put concrete in a 20?', 'Can I talk to someone?'];
const avatar = computed(() => initials(props.business));
</script>

<template>
  <div class="phone-screen" aria-label="Test call">
    <div v-if="phase === 'idle'" class="call-idle">
      <div class="call-avatar" aria-hidden="true">{{ avatar }}</div>
      <div>
        <b class="heading" style="font-size: 20px">{{ business }}</b>
        <div v-if="phone" class="small muted">{{ formatPhone(phone) }}</div>
      </div>
      <p class="small muted" style="max-width: 260px">You play the caller and type what you'd say. The receptionist answers from your settings and pricing rules.</p>
      <OvButton variant="primary" :disabled="!settings.enabled" @click="start">Call {{ business }}</OvButton>
      <p v-if="!settings.enabled" class="small muted">Turn the receptionist on to try a call.</p>
      <OvSwitch v-if="canSpeak" v-model="speakAloud" label="Speak replies out loud" class="small" />
    </div>

    <template v-else>
      <div class="call-top">
        <b>{{ phase === 'ended' ? 'Call ended' : business }}</b>
        <span v-if="phase === 'live'" class="small" style="color: var(--on-night-muted)">
          AI receptionist · <span class="call-timer">{{ formatDuration(elapsed) }}</span>
        </span>
        <span v-else class="call-timer">{{ formatDuration(elapsed) }}</span>
      </div>
      <div ref="lineEl" class="call-lines" :aria-live="phase === 'live' ? 'polite' : 'off'">
        <div v-for="(l, i) in lines" :key="i" :class="['wmsg', `wmsg--${l.who}`]">{{ l.text }}</div>
        <div v-if="busy" class="wmsg wmsg--system">The receptionist is answering</div>
        <div v-if="phase === 'ended'" class="wmsg wmsg--system">
          {{ transferredTo ? `Transferred to ${formatPhone(transferredTo)}` : 'Summary saved to the call log and your inbox' }}
        </div>
      </div>
      <template v-if="phase === 'live'">
        <div class="quick" role="group" aria-label="Things to say">
          <button v-for="c in chips" :key="c" type="button" class="ov-chip ov-chip--small" :disabled="busy" @click="say(c)">{{ c }}</button>
        </div>
        <form class="composer" @submit.prevent="say(text)">
          <label class="sr" for="call-input">What the caller says</label>
          <OvInput id="call-input" v-model="text" autocomplete="off" placeholder="Say something as the caller" />
          <OvButton type="submit" variant="primary" :loading="busy" :disabled="!text.trim()">Say</OvButton>
        </form>
        <div class="call-foot">
          <OvSwitch v-if="canSpeak" v-model="speakAloud" label="Speak replies out loud" class="small" />
          <OvButton size="sm" class="call-end" :disabled="busy" @click="hangUp">End call</OvButton>
        </div>
      </template>
      <div v-else class="call-summary">
        <p class="small"><b>Summary.</b> {{ summary }}</p>
        <div class="actions">
          <OvButton variant="primary" size="sm" @click="start">Call again</OvButton>
          <OvButton v-if="conversationId" :as="RouterLink" :to="`/inbox/${conversationId}`" variant="secondary" size="sm">Open in inbox</OvButton>
        </div>
      </div>
    </template>
  </div>
</template>
