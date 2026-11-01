<script setup lang="ts">
import { OvButton } from '@oraviq/ui';

/** A request failed: say so in one line and offer a retry. */
withDefaults(defineProps<{ message: string | null; retryLabel?: string }>(), { retryLabel: 'Try again' });
defineEmits<{ retry: [] }>();
</script>

<template>
  <div class="error-box" role="alert">
    <p>{{ message || 'That did not load.' }}</p>
    <OvButton variant="secondary" size="sm" @click="$emit('retry')">{{ retryLabel }}</OvButton>
  </div>
</template>
