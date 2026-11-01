<script setup lang="ts">
import { computed, type Component } from 'vue';
import OvIcon from './OvIcon.vue';
import OvSpinner from './OvSpinner.vue';
import type { IconName } from '../icons';
import type { ButtonSize, ButtonVariant } from '../utils/types';

const props = withDefaults(
  defineProps<{
    /** primary: graphite; signal: violet, one per screen; secondary: lavender; outline; quiet: underlined text. */
    variant?: ButtonVariant;
    size?: ButtonSize;
    loading?: boolean;
    disabled?: boolean;
    /** Renders an <a> with this href. */
    href?: string;
    /** Router location; pass `as` (e.g. RouterLink) with it. */
    to?: unknown;
    /** Element or component to render, e.g. 'a' or RouterLink. */
    as?: string | Component;
    type?: 'button' | 'submit' | 'reset';
    icon?: IconName;
    iconEnd?: IconName;
    /** Full width. */
    block?: boolean;
  }>(),
  { variant: 'primary', size: 'md', type: 'button', href: undefined, to: undefined, as: undefined, icon: undefined, iconEnd: undefined },
);

const emit = defineEmits<{ click: [event: MouseEvent] }>();

const tag = computed<string | Component>(() => props.as ?? (props.href != null ? 'a' : 'button'));
const isNativeButton = computed(() => tag.value === 'button');
const inert = computed(() => props.disabled || props.loading);
const iconSize = computed(() => (props.size === 'sm' ? 16 : 18));

const attrs = computed(() => {
  const a: Record<string, unknown> = {};
  if (isNativeButton.value) {
    a.type = props.type;
    if (props.disabled) a.disabled = true;
  } else {
    if (props.href != null) a.href = props.disabled ? undefined : props.href;
    if (props.to !== undefined) a.to = props.to;
    if (props.disabled) {
      a['aria-disabled'] = 'true';
      a.tabindex = -1;
    }
  }
  if (props.loading) {
    a['aria-busy'] = 'true';
    if (isNativeButton.value) a['aria-disabled'] = 'true';
  }
  return a;
});

function onClick(e: MouseEvent) {
  if (inert.value) {
    e.preventDefault();
    e.stopImmediatePropagation();
    return;
  }
  emit('click', e);
}
</script>

<template>
  <component
    :is="tag"
    v-bind="attrs"
    :class="[
      'ov-btn',
      `ov-btn--${variant}`,
      { 'ov-btn--small': size === 'sm', 'ov-btn--block': block, 'is-loading': loading, 'is-disabled': disabled && !isNativeButton },
    ]"
    @click="onClick"
  >
    <OvSpinner v-if="loading" class="ov-btn__spinner" :size="iconSize" label="" />
    <OvIcon v-else-if="icon" :name="icon" :size="iconSize" class="ov-btn__icon" />
    <span class="ov-btn__label"><slot /></span>
    <OvIcon v-if="iconEnd" :name="iconEnd" :size="iconSize" class="ov-btn__icon" />
  </component>
</template>
