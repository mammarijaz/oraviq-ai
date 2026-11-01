<script setup lang="ts">
import { ref } from 'vue';
import OvIcon from './OvIcon.vue';
import OvTooltip from './OvTooltip.vue';

/** An info icon button with a tooltip that defines a term next to it. Works on hover, keyboard focus and tap. */
withDefaults(
  defineProps<{
    text: string;
    /** Accessible name of the button, e.g. "About included tons". */
    label?: string;
    side?: 'top' | 'bottom' | 'left' | 'right';
    align?: 'start' | 'center' | 'end';
  }>(),
  { label: 'More information', side: 'top', align: 'center' },
);
const open = ref(false);
</script>

<template>
  <span class="ov-tip">
    <OvTooltip v-model:open="open" :text="text" :side="side" :align="align" disable-closing-trigger>
      <button type="button" class="ov-tip__btn" :aria-label="label" @click="open = true">
        <OvIcon name="info" :size="16" />
      </button>
    </OvTooltip>
  </span>
</template>
