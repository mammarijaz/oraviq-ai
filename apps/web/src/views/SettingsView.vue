<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { OvButton, OvCard, OvDropdown, OvField, OvInput, OvPageHeader, OvSkeleton, OvStatus, OvSwitch, useToast } from '@oraviq/ui';
import { formatPhone, toE164, type BusinessHours, type ChannelConnectionDto, type Role } from '@oraviq/shared';
import ErrorState from '@/components/ErrorState.vue';
import { api, errorMessage } from '@/api';
import { useAsync } from '@/composables/useAsync';
import { useConnect } from '@/composables/useConnect';
import { useAuthStore } from '@/stores/auth';
import { STATE_OPTIONS, TIMEZONES } from '@/lib/states';
import { DAY_LONG, formatClock } from '@/lib/hours';
import { initials } from '@/lib/format';
import { subscribeToPush, type PushResult } from '@/lib/pushSubscribe';

const auth = useAuthStore();
const { toast } = useToast();

/* ---------------------------------------------------------------- business details */

const biz = reactive({ name: '', phone: '', city: '', state: null as string | null, timezone: 'America/New_York' as string | null });
const bizErrors = reactive<{ name?: string; phone?: string }>({});
const savingBiz = ref(false);
watch(
  () => auth.tenant,
  (t) => {
    if (!t) return;
    Object.assign(biz, { name: t.name, phone: t.phone ? formatPhone(t.phone) : '', city: t.city ?? '', state: t.state ?? null, timezone: t.timezone });
  },
  { immediate: true },
);

async function saveBiz() {
  bizErrors.name = biz.name.trim() ? undefined : 'Enter your business name.';
  bizErrors.phone = !biz.phone.trim() || toE164(biz.phone) ? undefined : 'Enter a 10-digit US number.';
  if (bizErrors.name || bizErrors.phone) return;
  savingBiz.value = true;
  try {
    const t = await api.tenant.update({
      name: biz.name.trim(),
      phone: biz.phone.trim() ? toE164(biz.phone) : null,
      city: biz.city.trim() || null,
      state: biz.state,
      timezone: biz.timezone ?? undefined,
    });
    auth.setTenant(t);
    toast('Business details saved.');
  } catch (e) {
    toast(errorMessage(e), { tone: 'danger' });
  } finally {
    savingBiz.value = false;
  }
}

/* ---------------------------------------------------------------- hours */

const ORDER = [1, 2, 3, 4, 5, 6, 0];
const TIMES = Array.from({ length: 48 }, (_, i) => {
  const v = `${String(Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`;
  return { value: v, label: formatClock(v) };
});
const hours = ref<Array<{ day: number; open: boolean; from: string; to: string }>>([]);
watch(
  () => auth.tenant?.businessHours,
  (h) => {
    hours.value = ORDER.map((d) => {
      const x = h?.days?.[d];
      return { day: d, open: !!x, from: x?.open ?? '07:00', to: x?.close ?? '17:00' };
    });
  },
  { immediate: true },
);
const hoursError = computed(() => hours.value.find((h) => h.open && h.from >= h.to));
const savingHours = ref(false);
async function saveHours() {
  if (hoursError.value) return;
  const days: BusinessHours['days'] = [0, 1, 2, 3, 4, 5, 6].map((d) => {
    const h = hours.value.find((x) => x.day === d)!;
    return h.open ? { day: d, open: h.from, close: h.to } : null;
  });
  savingHours.value = true;
  try {
    auth.setTenant(await api.tenant.update({ businessHours: { days } }));
    toast('Hours saved. The receptionist uses them for after-hours calls.');
  } catch (e) {
    toast(errorMessage(e), { tone: 'danger' });
  } finally {
    savingHours.value = false;
  }
}

/* ---------------------------------------------------------------- team */

const team = useAsync(() => api.team.list());
const canInvite = computed(() => auth.user?.role === 'owner' || auth.user?.role === 'admin');
const invite = reactive({ name: '', email: '', role: 'dispatcher' as Role | null });
const inviteErrors = reactive<{ name?: string; email?: string }>({});
const inviting = ref(false);
const ROLE_OPTIONS = [
  { value: 'admin', label: 'Admin', hint: 'Everything, including pricing and team' },
  { value: 'dispatcher', label: 'Dispatcher', hint: 'Inbox and orders' },
  { value: 'staff', label: 'Staff', hint: 'Inbox only' },
];
const ROLE_LABEL: Record<Role, string> = { owner: 'Owner', admin: 'Admin', dispatcher: 'Dispatcher', staff: 'Staff' };

async function sendInvite() {
  inviteErrors.name = invite.name.trim() ? undefined : 'Enter their name.';
  inviteErrors.email = /^\S+@\S+\.\S+$/.test(invite.email.trim()) ? undefined : 'Enter an email like name@company.com.';
  if (inviteErrors.name || inviteErrors.email) return;
  inviting.value = true;
  try {
    const u = await api.team.invite({ name: invite.name.trim(), email: invite.email.trim().toLowerCase(), role: invite.role ?? 'dispatcher' });
    team.set([...(team.data.value ?? []), u]);
    toast(`Invite sent to ${u.email}.`);
    Object.assign(invite, { name: '', email: '' });
  } catch (e) {
    toast(errorMessage(e), { tone: 'danger' });
  } finally {
    inviting.value = false;
  }
}

/* ---------------------------------------------------------------- connections */

const connections = useAsync(() => api.connections.list());
const { busy: connecting, connect, NAMES } = useConnect();
const CONNECTABLE = new Set<ChannelConnectionDto['channel']>(['facebook', 'instagram', 'google', 'stripe']);
const STATUS: Record<ChannelConnectionDto['status'], { tone: 'confirmed' | 'neutral' | 'warning' | 'danger'; label: string }> = {
  connected: { tone: 'confirmed', label: 'Connected' },
  not_connected: { tone: 'neutral', label: 'Not connected' },
  pending: { tone: 'warning', label: 'Pending' },
  error: { tone: 'danger', label: 'Needs attention' },
};
async function connectOne(c: ChannelConnectionDto) {
  if (await connect(c.channel, [c.channel])) void connections.run();
}

/* ---------------------------------------------------------------- notifications on this device */

const notifSupported = typeof window !== 'undefined' && 'Notification' in window;
const notifPermission = ref(notifSupported ? Notification.permission : 'denied');
const subscribing = ref(false);
const PUSH_MESSAGE: Record<PushResult, string> = {
  subscribed: 'Notifications on for this device.',
  denied: 'Notifications are blocked. Allow them in your browser settings.',
  unsupported: "This browser can't receive notifications.",
  'no-key': 'Alerts show while Oraviq is open. Background notifications are not set up on this server yet.',
  'no-worker': 'Alerts show while Oraviq is open. Install the app or reload to get background notifications.',
};
async function enableNotifications() {
  if (!notifSupported) return;
  subscribing.value = true;
  try {
    const r = await subscribeToPush();
    notifPermission.value = Notification.permission;
    toast(PUSH_MESSAGE[r], { tone: r === 'subscribed' ? 'success' : 'info' });
  } catch (e) {
    toast(errorMessage(e), { tone: 'danger' });
  } finally {
    subscribing.value = false;
  }
}
</script>

<template>
  <OvPageHeader title="Settings">Your business details, hours, team and connected accounts.</OvPageHeader>

  <div class="settings-grid">
    <div class="stack">
      <OvCard as="section" title="Business details">
        <form class="settings" style="margin-top: 16px" novalidate @submit.prevent="saveBiz">
          <OvField label="Business name" :error="bizErrors.name"><OvInput v-model="biz.name" autocomplete="organization" /></OvField>
          <OvField label="Business phone" help="The number customers call. Missed calls forward to your Oraviq number." :error="bizErrors.phone">
            <OvInput v-model="biz.phone" type="tel" inputmode="tel" autocomplete="tel" />
          </OvField>
          <div class="form-row" style="grid-template-columns: minmax(0, 1fr) minmax(150px, 40%)">
            <OvField label="City"><OvInput v-model="biz.city" autocomplete="address-level2" /></OvField>
            <OvField label="State"><OvDropdown v-model="biz.state" variant="field" label="State" placeholder="Pick" :options="STATE_OPTIONS" searchable /></OvField>
          </div>
          <OvField label="Time zone"><OvDropdown v-model="biz.timezone" variant="field" label="Time zone" :options="TIMEZONES" /></OvField>
          <p v-if="auth.tenant?.oraviqNumber" class="small muted">Your Oraviq number: <b style="color: var(--ink)">{{ formatPhone(auth.tenant.oraviqNumber) }}</b></p>
          <div><OvButton type="submit" variant="primary" :loading="savingBiz">Save details</OvButton></div>
        </form>
      </OvCard>
      <OvCard as="section" title="Notifications on this device">
        <p class="small muted" style="margin-top: 4px">Get an alert for new orders and conversations that need you, even when Oraviq is in the background.</p>
        <div style="margin-top: 12px">
          <OvStatus v-if="notifPermission === 'granted'" tone="confirmed">On for this device</OvStatus>
          <p v-else-if="!notifSupported" class="small muted">This browser doesn't support notifications.</p>
          <OvButton v-else variant="secondary" size="sm" :loading="subscribing" @click="enableNotifications">Turn on notifications</OvButton>
        </div>
      </OvCard>

    </div>

    <div class="stack">
      <OvCard as="section" title="Team">
        <ErrorState v-if="team.status.value === 'error'" :message="team.error.value" @retry="team.run()" />
        <div v-else-if="!team.data.value" class="stack" style="margin-top: 12px"><OvSkeleton v-for="i in 2" :key="i" :lines="2" /></div>
        <div v-else style="margin-top: 8px">
          <div v-for="u in team.data.value" :key="u.id" class="member">
            <span class="avatar" aria-hidden="true">{{ initials(u.name) }}</span>
            <div style="min-width: 0">
              <b style="font-weight: 600">{{ u.name }}<span v-if="u.id === auth.user?.id" class="muted"> (you)</span></b>
              <div class="small muted" style="overflow-wrap: anywhere">{{ u.email }}</div>
            </div>
            <OvStatus tone="info">{{ ROLE_LABEL[u.role] }}</OvStatus>
          </div>
        </div>
        <form v-if="canInvite" class="settings" style="margin-top: 20px; gap: 16px" novalidate @submit.prevent="sendInvite">
          <p class="heading">Invite someone</p>
          <div class="form-row" style="grid-template-columns: 1fr 1fr">
            <OvField label="Name" :error="inviteErrors.name"><OvInput v-model="invite.name" autocomplete="off" /></OvField>
            <OvField label="Email" :error="inviteErrors.email"><OvInput v-model="invite.email" type="email" autocomplete="off" /></OvField>
          </div>
          <OvField label="Role"><OvDropdown v-model="invite.role" variant="field" label="Role" :options="ROLE_OPTIONS" /></OvField>
          <div><OvButton type="submit" variant="secondary" :loading="inviting">Send invite</OvButton></div>
        </form>
      </OvCard>

      <OvCard as="section" title="Connections">
        <ErrorState v-if="connections.status.value === 'error'" :message="connections.error.value" @retry="connections.run()" />
        <div v-else-if="!connections.data.value" class="stack" style="margin-top: 12px"><OvSkeleton v-for="i in 4" :key="i" height="40" /></div>
        <div v-else style="margin-top: 8px">
          <div v-for="c in connections.data.value" :key="c.channel" class="conn-row">
            <div style="min-width: 0">
              <b style="font-weight: 600">{{ NAMES[c.channel] }}</b>
              <div class="small muted">
                <OvStatus :tone="STATUS[c.status].tone">{{ STATUS[c.status].label }}</OvStatus>
                <span v-if="c.externalName"> · {{ c.externalName }}</span>
                <span v-if="c.provider"> · via {{ c.provider === 'mock' ? 'test mode' : c.provider[0]!.toUpperCase() + c.provider.slice(1) }}</span>
              </div>
            </div>
            <OvButton
              v-if="CONNECTABLE.has(c.channel) && c.status !== 'connected' && c.status !== 'pending'"
              variant="primary"
              size="sm"
              :loading="connecting === c.channel"
              @click="connectOne(c)"
            >
              Connect
            </OvButton>
          </div>
        </div>
      </OvCard>

    </div>
  </div>

  <OvCard as="section" title="Business hours">
        <p class="small muted" style="margin-top: 4px">The receptionist treats calls outside these hours as after hours.</p>
        <div class="hours" style="margin-top: 16px">
          <div v-for="h in hours" :key="h.day" class="hours-row">
            <b style="font-weight: 600">{{ DAY_LONG[h.day] }}</b>
            <OvSwitch v-model="h.open" :label="h.open ? 'Open' : 'Closed'" :aria-label="`${DAY_LONG[h.day]} open`" />
            <div v-if="h.open" class="hours-times">
              <OvDropdown v-model="h.from" variant="field" :label="`${DAY_LONG[h.day]} opens`" :options="TIMES" />
              <span class="small muted">to</span>
              <OvDropdown v-model="h.to" variant="field" :label="`${DAY_LONG[h.day]} closes`" :options="TIMES" />
            </div>
          </div>
        </div>
        <p v-if="hoursError" class="small" style="color: var(--danger); margin-top: 8px" role="alert">{{ DAY_LONG[hoursError.day] }} closes before it opens.</p>
        <div style="margin-top: 16px"><OvButton variant="primary" :loading="savingHours" :disabled="!!hoursError" @click="saveHours">Save hours</OvButton></div>
      </OvCard>
</template>
