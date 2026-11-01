<script setup lang="ts">
import { watch } from 'vue';
import { useRouter } from 'vue-router';
import { OvToaster } from '@oraviq/ui';
import { useAuthStore } from '@/stores/auth';
import { useInboxStore } from '@/stores/inbox';
import { useNavStore } from '@/stores/nav';
import { useOrdersStore } from '@/stores/orders';

const auth = useAuthStore();
const router = useRouter();

// The refresh token was rejected somewhere: drop cached data and go to sign in.
watch(
  () => auth.expired,
  (expired) => {
    if (!expired) return;
    useInboxStore().reset();
    useOrdersStore().reset();
    useNavStore().reset();
    const here = router.currentRoute.value;
    if (!here.meta.public) void router.replace({ name: 'login', query: { expired: '1', redirect: here.fullPath } });
  },
);
</script>

<template>
  <RouterView />
  <OvToaster />
</template>
