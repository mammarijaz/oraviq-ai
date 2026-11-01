<script setup lang="ts">
import { computed, provide, useId } from 'vue';
import { RADIO_GROUP_KEY } from '../composables/radio';
import { useModel } from '../composables/useModel';

/** A fieldset of native radios (arrow keys move between them). Put OvRadio children inside. */
const props = withDefaults(
  defineProps<{ modelValue?: string | null; label?: string; name?: string; orientation?: 'vertical' | 'horizontal'; disabled?: boolean; hideLabel?: boolean }>(),
  { modelValue: undefined, label: undefined, name: undefined, orientation: 'vertical' },
);
const emit = defineEmits<{ 'update:modelValue': [value: string] }>();
const model = useModel<string | null>(() => props.modelValue, (v) => emit('update:modelValue', v ?? ''), null);
const uid = useId();
provide(RADIO_GROUP_KEY, {
  name: computed(() => props.name ?? `ov-radio-${uid}`),
  value: computed(() => model.value ?? null),
  disabled: computed(() => !!props.disabled),
  select: (v: string) => {
    model.value = v;
  },
});
</script>

<template>
  <fieldset :class="['ov-radios', `ov-radios--${orientation}`]">
    <legend v-if="label" :class="['ov-field__label', 'ov-radios__legend', { 'ov-sr': hideLabel }]">{{ label }}</legend>
    <div class="ov-radios__items"><slot /></div>
  </fieldset>
</template>
