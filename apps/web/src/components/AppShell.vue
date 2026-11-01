<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { OvIcon, type IconName } from '@oraviq/ui';
import { formatPhone } from '@oraviq/shared';
import logoUrl from '@/assets/oraviq-logo.svg';
import { useAuthStore } from '@/stores/auth';
import { useNavStore } from '@/stores/nav';
import { useInboxStore } from '@/stores/inbox';
import { useOrdersStore } from '@/stores/orders';
import { useRealtime } from '@/composables/useRealtime';
import { initials } from '@/lib/format';

const auth = useAuthStore();
const nav = useNavStore();
const route = useRoute();
const router = useRouter();
const { status: live } = useRealtime();

const items: Array<{ key: string; to: string; label: string; icon: IconName }> = [
  { key: 'inbox', to: '/inbox', label: 'Inbox', icon: 'inbox' },
  { key: 'receptionist', to: '/receptionist', label: 'AI receptionist', icon: 'receptionist' },
  { key: 'try', to: '/try', label: 'Try it out', icon: 'mobile' },
  { key: 'orders', to: '/orders', label: 'Orders', icon: 'truck' },
  { key: 'reviews', to: '/reviews', label: 'Reviews', icon: 'star' },
  { key: 'website', to: '/website', label: 'Website & widgets', icon: 'globe' },
  { key: 'pricing', to: '/pricing', label: 'Pricing rules', icon: 'dollar' },
  { key: 'report', to: '/report', label: 'Weekly report', icon: 'chart' },
  { key: 'setup', to: '/setup', label: 'Setup', icon: 'setup' },
];

const counts = computed<Record<string, { n: number; label: string }>>(() => ({
  inbox: { n: nav.needsYou, label: `${nav.needsYou} need you` },
  reviews: { n: nav.reviewsWaiting, label: `${nav.reviewsWaiting} waiting for a reply` },
}));

const place = computed(() => {
  const t = auth.tenant;
  if (!t) return '';
  const where = [t.city, t.state].filter(Boolean).join(', ');
  return [where, t.phone ? formatPhone(t.phone) : ''].filter(Boolean).join(' · ');
});

const liveLabel = computed(
  () => ({ connected: 'Live updates on', connecting: 'Connecting', reconnecting: 'Reconnecting', offline: 'Offline', stopped: 'Live updates off' })[live.value],
);

const main = ref<HTMLElement | null>(null);
const announce = ref('');

// Move focus to the page on navigation (not when only the open conversation changes).
watch(
  () => route.name,
  async (name, prev) => {
    if (!prev || name === prev) return;
    await nextTick();
    main.value?.focus({ preventScroll: true });
    announce.value = `${route.meta.title ?? ''} page`;
  },
);

onMounted(() => {
  void nav.load().catch(() => {});
});

function signOut() {
  auth.logout();
  useInboxStore().reset();
  useOrdersStore().reset();
  nav.reset();
  void router.replace({ name: 'login' });
}
</script>

<template>
  <a class="skip-link" href="#main">Skip to content</a>
  <div class="app">
    <aside class="side" aria-label="Main">
      <RouterLink to="/inbox" class="logo" aria-label="Oraviq AI, inbox">
        <img :src="logoUrl" alt="" height="32" width="146" style="height: 32px; width: auto; display: block" />
      </RouterLink>
      <div class="biz">
        <b>{{ auth.tenant?.name ?? ' ' }}</b>
        <span v-if="place">{{ place }}</span>
      </div>
      <nav aria-label="Sections">
        <ul>
          <li v-for="item in items" :key="item.key">
            <RouterLink :to="item.to" :aria-current="route.meta.nav === item.key ? 'page' : undefined" active-class="" exact-active-class="">
              <OvIcon :name="item.icon" :size="19" />
              <span class="txt">{{ item.label }}</span>
              <span v-if="counts[item.key]?.n" class="count" :aria-label="counts[item.key]!.label">{{ counts[item.key]!.n }}</span>
            </RouterLink>
          </li>
        </ul>
      </nav>
      <div class="side-foot">
        <div v-if="auth.user" class="who">
          <span class="avatar" aria-hidden="true">{{ initials(auth.user.name) }}</span>
          <span class="who-text">
            <b>{{ auth.user.name }}</b>
            <span>{{ auth.user.email }}</span>
          </span>
        </div>
        <span :class="['conn', { 'conn--on': live === 'connected' }]" role="status">{{ liveLabel }}</span>
        <div class="links">
          <RouterLink to="/settings" class="link-btn" :aria-current="route.name === 'settings' ? 'page' : undefined">Settings</RouterLink>
          <button type="button" class="link-btn" @click="signOut">Sign out</button>
        </div>
      </div>
    </aside>
    <main id="main" ref="main" class="main" tabindex="-1">
      <RouterView v-slot="{ Component }">
        <component :is="Component" :key="String(route.name)" />
      </RouterView>
    </main>
  </div>
  <p class="sr" aria-live="polite">{{ announce }}</p>
</template>
