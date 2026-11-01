<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { OvAlert, OvButton, OvField, OvInput } from '@oraviq/ui';
import AuthLayout from '@/components/AuthLayout.vue';
import { errorMessage } from '@/api';
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();
const route = useRoute();
const router = useRouter();

const form = reactive({ email: '', password: '' });
const errors = reactive<{ email?: string; password?: string }>({});
const failure = ref<string | null>(null);
const busy = ref(false);
const expired = computed(() => route.query.expired === '1');

function validate() {
  errors.email = !form.email.trim() ? 'Enter your email.' : /^\S+@\S+\.\S+$/.test(form.email.trim()) ? undefined : 'Enter an email like you@company.com.';
  errors.password = form.password ? undefined : 'Enter your password.';
  return !errors.email && !errors.password;
}

async function submit() {
  failure.value = null;
  if (!validate()) return;
  busy.value = true;
  try {
    await auth.login({ email: form.email.trim().toLowerCase(), password: form.password });
    const to = typeof route.query.redirect === 'string' && route.query.redirect.startsWith('/') ? route.query.redirect : '/inbox';
    await router.replace(to);
  } catch (e) {
    const msg = errorMessage(e);
    failure.value = (e as { status?: number }).status === 401 ? 'That email and password do not match. Check them and try again.' : msg;
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <AuthLayout>
    <form class="auth-form" novalidate @submit.prevent="submit">
      <h1>Sign in</h1>
      <p class="muted">Your inbox, orders and the AI receptionist, in one place.</p>
      <OvAlert v-if="expired && !failure" tone="info" title="Signed out.">Your session ended. Sign in again to carry on.</OvAlert>
      <OvAlert v-if="failure" tone="danger" title="Not signed in." live>{{ failure }}</OvAlert>
      <OvField label="Email" :error="errors.email">
        <OvInput v-model="form.email" type="email" autocomplete="email" inputmode="email" @input="errors.email = undefined" />
      </OvField>
      <OvField label="Password" :error="errors.password">
        <OvInput v-model="form.password" type="password" autocomplete="current-password" @input="errors.password = undefined" />
      </OvField>
      <OvButton type="submit" variant="signal" block :loading="busy">Sign in</OvButton>
      <p class="small muted">New to Oraviq? <RouterLink to="/register" class="link-btn">Create an account</RouterLink></p>
    </form>
  </AuthLayout>
</template>
