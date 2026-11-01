<script setup lang="ts" generic="T extends boolean | string[] = boolean">
import { computed, onMounted, ref, watch } from 'vue';
import { useModel } from '../composables/useModel';

/**
 * A native checkbox in its label, so the whole row is clickable. v-model is a boolean, or an array when `value` is set.
 * `indeterminate` shows the mixed state (e.g. some of a group selected).
 */
defineOptions({ inheritAttrs: false });
const props = withDefaults(
  defineProps<{ modelValue?: T; value?: string; label?: string; hint?: string; indeterminate?: boolean; disabled?: boolean; id?: string; name?: string }>(),
  { value: undefined, label: undefined, hint: undefined, id: undefined, name: undefined },
);
const emit = defineEmits<{ 'update:modelValue': [value: T] }>();
const model = useModel<T>(() => props.modelValue, (v) => emit('update:modelValue', v), false as T);
const input = ref<HTMLInputElement | null>(null);

const checked = computed(() => (Array.isArray(model.value) ? props.value != null && model.value.includes(props.value) : !!model.value));

function onChange(e: Event) {
  const on = (e.target as HTMLInputElement).checked;
  if (Array.isArray(model.value)) {
    const v = props.value ?? '';
    model.value = (on ? [...model.value.filter((x) => x !== v), v] : model.value.filter((x) => x !== v)) as T;
  } else {
    model.value = on as T;
  }
}

const sync = () => {
  if (input.value) input.value.indeterminate = !!props.indeterminate;
};
onMounted(sync);
watch(() => [props.indeterminate, checked.value], sync, { flush: 'post' });
</script>

<template>
  <label :class="['ov-checkbox', $attrs.class, { 'is-disabled': disabled }]" :style="$attrs.style as any">
    <input
      :id="id"
      ref="input"
      v-bind="{ ...$attrs, class: undefined, style: undefined }"
      type="checkbox"
      :name="name"
      :value="value"
      :checked="checked"
      :disabled="disabled"
      :aria-checked="indeterminate ? 'mixed' : undefined"
      @change="onChange"
    />
    <span v-if="label || hint || $slots.default" class="ov-checkbox__text">
      <slot>{{ label }}</slot>
      <small v-if="hint">{{ hint }}</small>
    </span>
  </label>
</template>
