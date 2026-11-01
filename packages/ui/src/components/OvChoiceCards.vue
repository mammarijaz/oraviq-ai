<script setup lang="ts">
import { computed, useId } from 'vue';
import type { ChoiceOption } from '../utils/types';
import { useModel } from '../composables/useModel';

/** Radios as cards with a title and one line of explanation, for 2 to 4 options that need explaining. */
const props = withDefaults(
  defineProps<{ modelValue?: string | null; options: ChoiceOption[]; label?: string; hideLabel?: boolean; name?: string; columns?: number; disabled?: boolean }>(),
  { modelValue: undefined, label: undefined, name: undefined, columns: 1 },
);
const emit = defineEmits<{ 'update:modelValue': [value: string] }>();
const model = useModel<string | null>(() => props.modelValue, (v) => emit('update:modelValue', v ?? ''), null);
const uid = useId();
const groupName = computed(() => props.name ?? `ov-choice-${uid}`);
</script>

<template>
  <fieldset class="ov-choices" :style="columns > 1 ? { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` } : undefined">
    <legend v-if="label" :class="['ov-field__label', 'ov-choices__legend', { 'ov-sr': hideLabel }]">{{ label }}</legend>
    <label v-for="op in options" :key="op.value" :class="['ov-choice', { 'is-disabled': op.disabled || disabled }]">
      <input
        type="radio"
        :name="groupName"
        :value="op.value"
        :checked="model === op.value"
        :disabled="op.disabled || disabled"
        @change="model = op.value"
      />
      <span>
        <b>{{ op.title }}</b>
        <span v-if="op.description">{{ op.description }}</span>
      </span>
    </label>
  </fieldset>
</template>
