<script setup lang="ts">
import { useControl } from '../composables/useField';
import { useModel } from '../composables/useModel';

defineOptions({ inheritAttrs: false });
const props = withDefaults(
  defineProps<{
    modelValue?: string | null;
    id?: string;
    placeholder?: string;
    rows?: number;
    disabled?: boolean;
    readonly?: boolean;
    invalid?: boolean;
    name?: string;
    maxlength?: number;
    ariaLabel?: string;
  }>(),
  { modelValue: undefined, id: undefined, placeholder: undefined, rows: 4, name: undefined, maxlength: undefined, ariaLabel: undefined },
);
const emit = defineEmits<{ 'update:modelValue': [value: string] }>();
const model = useModel<string | null>(() => props.modelValue, (v) => emit('update:modelValue', v ?? ''), null);
const { id, invalid, describedBy, required } = useControl(props, 'ov-textarea');
</script>

<template>
  <textarea
    v-bind="$attrs"
    :id="id"
    class="ov-input ov-textarea"
    :value="model ?? ''"
    :rows="rows"
    :placeholder="placeholder"
    :disabled="disabled"
    :readonly="readonly"
    :required="required || undefined"
    :aria-invalid="invalid ? 'true' : undefined"
    :name="name"
    :maxlength="maxlength"
    :aria-label="ariaLabel"
    :aria-describedby="describedBy"
    @input="model = ($event.target as HTMLTextAreaElement).value"
  />
</template>
