<script setup lang="ts">
import { ref } from 'vue';
import OvIcon from './OvIcon.vue';

/** A pill search field with an icon and a clear button that appears once something is typed. Use above lists and tables. */
defineOptions({ inheritAttrs: false });
withDefaults(defineProps<{ id?: string; placeholder?: string; label?: string; disabled?: boolean; name?: string }>(), {
  id: undefined,
  name: undefined,
  placeholder: 'Search',
  label: undefined,
});
const model = defineModel<string>({ default: '' });
const emit = defineEmits<{ clear: [] }>();
const input = ref<HTMLInputElement | null>(null);

function clear() {
  model.value = '';
  emit('clear');
  input.value?.focus();
}
function onEscape(e: KeyboardEvent) {
  if (!model.value) return;
  e.preventDefault();
  e.stopPropagation();
  clear();
}
defineExpose({ focus: () => input.value?.focus() });
</script>

<template>
  <div :class="['ov-search', $attrs.class]" :style="$attrs.style as any">
    <OvIcon name="search" :size="16" />
    <input
      :id="id"
      ref="input"
      v-bind="{ ...$attrs, class: undefined, style: undefined }"
      v-model="model"
      type="search"
      :name="name"
      :placeholder="placeholder"
      :aria-label="label ?? placeholder"
      :disabled="disabled"
      autocomplete="off"
      @keydown.esc="onEscape"
    />
    <button v-if="model" type="button" class="ov-search__clear" aria-label="Clear search" @click="clear">
      <OvIcon name="close" :size="16" />
    </button>
  </div>
</template>
