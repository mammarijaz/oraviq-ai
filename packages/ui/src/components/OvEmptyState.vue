<script setup lang="ts">
import OvIcon from './OvIcon.vue';
import OvButton from './OvButton.vue';
import type { IconName } from '../icons';

/** What a list shows when nothing matches: a lavender circle with a violet icon, a title that states the fact, one line, at most one action. */
withDefaults(defineProps<{ title: string; text?: string; icon?: IconName; actionLabel?: string; headingLevel?: 2 | 3 | 4 }>(), {
  text: undefined,
  icon: 'search',
  actionLabel: undefined,
  headingLevel: 3,
});
const emit = defineEmits<{ action: [] }>();
</script>

<template>
  <div class="ov-empty">
    <span class="ov-empty__icon" aria-hidden="true"><OvIcon :name="icon" :size="24" /></span>
    <component :is="`h${headingLevel}`" class="ov-empty__title">{{ title }}</component>
    <p v-if="text || $slots.default" class="ov-empty__text"><slot>{{ text }}</slot></p>
    <slot name="action">
      <OvButton v-if="actionLabel" variant="secondary" size="sm" @click="emit('action')">{{ actionLabel }}</OvButton>
    </slot>
  </div>
</template>
