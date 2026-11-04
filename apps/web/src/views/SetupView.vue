<script setup lang="ts">
import { computed, ref } from 'vue';
import { RouterLink } from 'vue-router';
import { OvButton, OvCard, OvIcon, OvPageHeader, OvSkeleton, OvStatus, useToast } from '@oraviq/ui';
import type { ChannelConnectionDto, SetupStepDto } from '@oraviq/shared';
import ErrorState from '@/components/ErrorState.vue';
import { api, errorMessage } from '@/api';
import { useAsync } from '@/composables/useAsync';
import { useConnect } from '@/composables/useConnect';

const steps = useAsync(() => api.setup.steps());
const { toast } = useToast();
const { busy: connecting, connect } = useConnect();
const testing = ref(false);

const CONNECT: Partial<Record<SetupStepDto['key'], ChannelConnectionDto['channel'][]>> = {
  meta: ['facebook', 'instagram'],
  google: ['google'],
  payments: ['stripe'],
};

const doneCount = computed(() => (steps.data.value ?? []).filter((s) => s.status === 'done').length);

/** Dial codes ("*71 4045550177", "**004*4045550177#") and `backticked` text render as code. */
function parts(text: string) {
  const re = /`([^`]+)`|(\*{1,2}\d{2,3}\*?\s?\d{7,11}#?)/g;
  const out: Array<{ t: string; code: boolean }> = [];
  let last = 0;
  for (const m of text.matchAll(re)) {
    if (m.index! > last) out.push({ t: text.slice(last, m.index), code: false });
    out.push({ t: m[1] ?? m[2]!, code: true });
    last = m.index! + m[0].length;
  }
  if (last < text.length) out.push({ t: text.slice(last), code: false });
  return out;
}

/** App routes only; the API also sends its own paths (/setup/test-call, /connections/…) for steps we handle with buttons. */
function isInternal(href?: string) {
  return !!href && href.startsWith('/') && href !== '/setup' && !/^\/(setup|connections)\//.test(href);
}

const buying = ref(false);
async function getNumber() {
  buying.value = true;
  try {
    const r = await api.setup.number();
    toast(`Your Oraviq number is ${r.display}.`);
    void steps.run();
  } catch (e) {
    toast(errorMessage(e), { tone: 'danger' });
  } finally {
    buying.value = false;
  }
}

async function testCall() {
  testing.value = true;
  try {
    const r = await api.setup.testCall();
    toast(r.message, { tone: r.ok ? 'success' : 'danger' });
    void steps.run();
  } catch (e) {
    toast(errorMessage(e), { tone: 'danger' });
  } finally {
    testing.value = false;
  }
}

async function onConnect(s: SetupStepDto) {
  const chans = CONNECT[s.key];
  if (chans && (await connect(s.key, chans))) void steps.run();
}
</script>

<template>
  <OvPageHeader title="Setup">
    Most haulers are live in under an hour. We do the setup with you on a call.
    <template v-if="steps.data.value" #right>
      <p class="demo-note">{{ doneCount }} of {{ steps.data.value.length }} done</p>
    </template>
  </OvPageHeader>

  <ErrorState v-if="steps.status.value === 'error'" :message="steps.error.value" @retry="steps.run()" />
  <OvCard v-else-if="!steps.data.value"><div class="stack"><OvSkeleton v-for="i in 6" :key="i" :lines="2" /></div></OvCard>
  <OvCard v-else as="section" class="steps" aria-label="Setup steps">
    <ol style="list-style: none; margin: 0; padding: 0">
      <li v-for="(s, i) in steps.data.value" :key="s.key" :class="['step', { done: s.status === 'done' }]">
        <span class="step-num" aria-hidden="true">
          <OvIcon v-if="s.status === 'done'" name="check" :size="16" />
          <template v-else>{{ i + 1 }}</template>
        </span>
        <div>
          <p class="heading">
            {{ s.title }}
            <OvStatus v-if="s.status === 'in_review'" tone="warning">In review</OvStatus>
            <OvStatus v-else-if="s.status === 'blocked'" tone="danger">Blocked</OvStatus>
            <span v-if="s.status === 'done'" class="sr">(done)</span>
          </p>
          <div class="small muted" style="margin-top: 4px">
            <template v-for="(p, j) in parts(s.description)" :key="j"><code v-if="p.code">{{ p.t }}</code><template v-else>{{ p.t }}</template></template>
          </div>
        </div>
        <div class="step-actions">
          <template v-if="CONNECT[s.key]">
            <OvStatus v-if="s.status === 'done'" tone="confirmed">Connected</OvStatus>
            <OvButton v-else-if="s.status !== 'in_review'" variant="primary" size="sm" :loading="connecting === s.key" @click="onConnect(s)">
              {{ s.actionLabel || 'Connect' }}
            </OvButton>
          </template>
          <OvButton v-else-if="s.key === 'number' && s.status !== 'done'" variant="primary" size="sm" :loading="buying" @click="getNumber">
            {{ s.actionLabel || 'Get my number' }}
          </OvButton>
          <OvButton v-else-if="s.key === 'forwarding' && s.status !== 'done'" variant="primary" size="sm" :loading="testing" @click="testCall">
            {{ s.actionLabel || 'Run test call' }}
          </OvButton>
          <template v-else-if="s.actionHref && (isInternal(s.actionHref) || /^https?:/.test(s.actionHref))">
            <OvButton v-if="isInternal(s.actionHref)" :as="RouterLink" :to="s.actionHref" variant="secondary" size="sm">{{ s.actionLabel || 'Edit' }}</OvButton>
            <OvButton v-else :href="s.actionHref" variant="secondary" size="sm" target="_blank" rel="noopener">{{ s.actionLabel || 'Open' }}</OvButton>
          </template>
        </div>
      </li>
    </ol>
  </OvCard>
</template>
