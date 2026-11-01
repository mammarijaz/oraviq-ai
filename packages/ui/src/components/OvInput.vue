<script setup lang="ts" generic="T extends string | number | null = string">
import { useControl } from '../composables/useField';
import { useModel } from '../composables/useModel';

defineOptions({ inheritAttrs: false });
const props = withDefaults(
  defineProps<{
    /** The value; with type="number" a number is emitted. */
    modelValue?: T;
    id?: string;
    type?: string;
    placeholder?: string;
    disabled?: boolean;
    readonly?: boolean;
    invalid?: boolean;
    size?: 'md' | 'sm';
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
    id: undefined, type: 'text', placeholder: undefined, size: 'md', name: undefined, autocomplete: undefined, inputmode: undefined,
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
  <input
    v-bind="$attrs"
    :id="id"
    :class="['ov-input', { 'ov-input--small': size === 'sm' }]"
    :type="type"
    :value="model ?? ''"
    :placeholder="placeholder"
    :disabled="disabled"
    :readonly="readonly"
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
</template>
