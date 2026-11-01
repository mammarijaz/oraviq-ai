<script setup lang="ts" generic="T extends string | number | null = string">
import { useControl } from '../composables/useField';
import { useModel } from '../composables/useModel';

/** An input with a unit beside the value ("$", "per day", "tons"), so the number stays a plain number. */
defineOptions({ inheritAttrs: false });
const props = withDefaults(
  defineProps<{
    modelValue?: T;
    id?: string;
    prefix?: string;
    suffix?: string;
    type?: string;
    placeholder?: string;
    disabled?: boolean;
    invalid?: boolean;
    name?: string;
    autocomplete?: string;
    inputmode?: 'text' | 'decimal' | 'numeric' | 'tel' | 'email' | 'url' | 'search' | 'none';
    maxlength?: number;
    min?: number | string;
    max?: number | string;
    step?: number | string;
    pattern?: string;
    ariaLabel?: string;
    ariaDescribedby?: string;
  }>(),
  {
    id: undefined, prefix: undefined, suffix: undefined, type: 'text', inputmode: undefined, placeholder: undefined, name: undefined, autocomplete: undefined,
    maxlength: undefined, min: undefined, max: undefined, step: undefined, pattern: undefined, ariaLabel: undefined, ariaDescribedby: undefined,
  },
);
const emit = defineEmits<{ 'update:modelValue': [value: T] }>();
const model = useModel<T | null>(() => props.modelValue, (v) => emit('update:modelValue', v as T), null);
const { id, invalid, describedBy, required } = useControl(props, 'ov-input');

function onInput(e: Event) {
  const el = e.target as HTMLInputElement;
  model.value = (props.type === 'number' && el.value !== '' && !Number.isNaN(el.valueAsNumber) ? el.valueAsNumber : el.value) as T;
}
</script>

<template>
  <div :class="['ov-input-group', { 'ov-input-group--invalid': invalid, 'is-disabled': disabled }]">
    <span v-if="prefix || $slots.prefix" class="ov-input-group__addon" aria-hidden="true"><slot name="prefix">{{ prefix }}</slot></span>
    <input
      v-bind="$attrs"
      :id="id"
      :type="type"
      :value="model ?? ''"
      :placeholder="placeholder"
      :disabled="disabled"
      :required="required || undefined"
      :aria-invalid="invalid ? 'true' : undefined"
      :name="name"
      :autocomplete="autocomplete"
      :inputmode="inputmode"
      :maxlength="maxlength"
      :min="min"
      :max="max"
      :step="step"
      :pattern="pattern"
      :aria-label="ariaLabel"
      :aria-describedby="ariaDescribedby ?? describedBy"
      @input="onInput"
    />
    <span v-if="suffix || $slots.suffix" class="ov-input-group__addon" aria-hidden="true"><slot name="suffix">{{ suffix }}</slot></span>
  </div>
</template>
