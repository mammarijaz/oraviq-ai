<script setup lang="ts">
import { computed, inject } from 'vue';
import { RADIO_GROUP_KEY } from '../composables/radio';

defineOptions({ inheritAttrs: false });
const props = withDefaults(defineProps<{ value: string; label?: string; hint?: string; disabled?: boolean; id?: string }>(), {
  label: undefined,
  hint: undefined,
  id: undefined,
});
const group = inject(RADIO_GROUP_KEY, null);
const checked = computed(() => group?.value.value === props.value);
</script>

<template>
  <label :class="['ov-radio', $attrs.class, { 'is-disabled': disabled || group?.disabled.value }]" :style="$attrs.style as any">
    <input
      :id="id"
      v-bind="{ ...$attrs, class: undefined, style: undefined }"
      type="radio"
      :name="group?.name.value"
      :value="value"
      :checked="checked"
      :disabled="disabled || group?.disabled.value"
      @change="group?.select(value)"
    />
    <span v-if="label || hint || $slots.default" class="ov-radio__text">
      <slot>{{ label }}</slot>
      <small v-if="hint">{{ hint }}</small>
    </span>
  </label>
</template>
