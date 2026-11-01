<script setup lang="ts">
/** An on/off setting that applies right away ("Receptionist on"). Use a checkbox when the choice is saved with a button. */
defineOptions({ inheritAttrs: false });
withDefaults(defineProps<{ label?: string; hint?: string; disabled?: boolean; id?: string }>(), { label: undefined, hint: undefined, id: undefined });
const model = defineModel<boolean>({ default: false });
</script>

<template>
  <label :class="['ov-switch', $attrs.class, { 'is-disabled': disabled }]" :style="$attrs.style as any">
    <input
      :id="id"
      v-bind="{ ...$attrs, class: undefined, style: undefined }"
      type="checkbox"
      role="switch"
      :checked="model"
      :disabled="disabled"
      @change="model = ($event.target as HTMLInputElement).checked"
    />
    <span v-if="label || hint || $slots.default" class="ov-switch__text">
      <slot>{{ label }}</slot>
      <small v-if="hint">{{ hint }}</small>
    </span>
  </label>
</template>
