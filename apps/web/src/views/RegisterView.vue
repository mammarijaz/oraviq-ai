<script setup lang="ts">
import { reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { OvAlert, OvButton, OvDropdown, OvField, OvInput } from '@oraviq/ui';
import { toE164 } from '@oraviq/shared';
import AuthLayout from '@/components/AuthLayout.vue';
import { errorMessage } from '@/api';
import { useAuthStore } from '@/stores/auth';
import { STATE_OPTIONS } from '@/lib/states';

const auth = useAuthStore();
const router = useRouter();

const form = reactive({ businessName: '', ownerName: '', email: '', password: '', phone: '', city: '', state: null as string | null });
type Key = keyof typeof form;
const errors = reactive<Partial<Record<Key, string>>>({});
const failure = ref<string | null>(null);
const problems = ref<string[]>([]);
const busy = ref(false);

function validate(): boolean {
  errors.businessName = form.businessName.trim() ? undefined : 'Enter your business name.';
  errors.ownerName = form.ownerName.trim() ? undefined : 'Enter your name.';
  errors.email = !form.email.trim() ? 'Enter your email.' : /^\S+@\S+\.\S+$/.test(form.email.trim()) ? undefined : 'Enter an email like you@company.com.';
  errors.password = form.password.length >= 8 ? undefined : 'Use 8 or more characters.';
  errors.phone = !form.phone.trim() || toE164(form.phone) ? undefined : 'Enter a 10-digit US number, like (404) 555-0100.';
  errors.state = form.city.trim() && !form.state ? 'Pick the state.' : undefined;
  return !Object.values(errors).some(Boolean);
}

function clearError(k: Key) {
  errors[k] = undefined;
}

async function submit() {
  failure.value = null;
  problems.value = [];
  if (!validate()) {
    // Focus the first field with an error.
    requestAnimationFrame(() => (document.querySelector('[aria-invalid="true"]') as HTMLElement | null)?.focus());
    return;
  }
  busy.value = true;
  try {
    await auth.register({
      businessName: form.businessName.trim(),
      ownerName: form.ownerName.trim(),
      email: form.email.trim().toLowerCase(),
      password: form.password,
      phone: form.phone.trim() ? (toE164(form.phone) ?? undefined) : undefined,
      city: form.city.trim() || undefined,
      state: form.state ?? undefined,
    });
    await router.replace('/setup');
  } catch (e) {
    failure.value = (e as { status?: number }).status === 409 ? 'An account with that email already exists. Sign in instead.' : errorMessage(e);
    problems.value = (e as { problems?: string[] }).problems ?? [];
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <AuthLayout>
    <form class="auth-form" novalidate @submit.prevent="submit">
      <h1>Create your account</h1>
      <p class="muted">Set up takes under an hour. We reserve an Oraviq number for you and load a sample price table you can edit.</p>
      <OvAlert v-if="failure" tone="danger" title="Not created." live>
        {{ failure }}
        <ul v-if="problems.length > 1" class="problems">
          <li v-for="p in problems" :key="p">{{ p }}</li>
        </ul>
      </OvAlert>
      <OvField label="Business name" :error="errors.businessName">
        <OvInput v-model="form.businessName" autocomplete="organization" @input="clearError('businessName')" />
      </OvField>
      <OvField label="Your name" :error="errors.ownerName">
        <OvInput v-model="form.ownerName" autocomplete="name" @input="clearError('ownerName')" />
      </OvField>
      <OvField label="Email" :error="errors.email">
        <OvInput v-model="form.email" type="email" autocomplete="email" inputmode="email" @input="clearError('email')" />
      </OvField>
      <OvField label="Password" help="8 or more characters." :error="errors.password">
        <OvInput v-model="form.password" type="password" autocomplete="new-password" @input="clearError('password')" />
      </OvField>
      <OvField label="Business phone (optional)" help="The number customers call today. We forward missed calls from it." :error="errors.phone">
        <OvInput v-model="form.phone" type="tel" autocomplete="tel" inputmode="tel" placeholder="(404) 555-0100" @input="clearError('phone')" />
      </OvField>
      <div class="three">
        <OvField label="City (optional)" :error="errors.city">
          <OvInput v-model="form.city" autocomplete="address-level2" />
        </OvField>
        <OvField label="State" :error="errors.state">
          <OvDropdown v-model="form.state" variant="field" label="State" placeholder="Pick" :options="STATE_OPTIONS" searchable @update:model-value="clearError('state')" />
        </OvField>
      </div>
      <OvButton type="submit" variant="signal" block :loading="busy">Create account</OvButton>
      <p class="small muted">Already have an account? <RouterLink to="/login" class="link-btn">Sign in</RouterLink></p>
    </form>
  </AuthLayout>
</template>
