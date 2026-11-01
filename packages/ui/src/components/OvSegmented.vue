<script setup lang="ts">
import OvIcon from './OvIcon.vue';
import type { SegmentedOption } from '../utils/types';
import { useModel } from '../composables/useModel';

/** 2 to 4 short options on a grey track for a small setting ("Left" / "Right"). Buttons with aria-pressed, as in the kit. */
const props = withDefaults(defineProps<{ modelValue?: string; options: SegmentedOption[]; label: string; size?: 'md' | 'sm' }>(), { modelValue: undefined, size: 'md' });
const emit = defineEmits<{ 'update:modelValue': [value: string] }>();
const model = useModel<string>(() => props.modelValue, (v) => emit('update:modelValue', v), '');
</script>

<template>
  <div :class="['ov-seg', { 'ov-seg--small': size === 'sm' }]" role="group" :aria-label="label">
    <button
      v-for="o in options"
      :key="o.value"
      type="button"
      :aria-pressed="model === o.value ? 'true' : 'false'"
      :disabled="o.disabled"
      @click="model = o.value"
    >
      <OvIcon v-if="o.icon" :name="o.icon" :size="15" />{{ o.label }}
    </button>
  </div>
</template>
