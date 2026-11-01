<script setup lang="ts">
import type { StatusTone } from '../utils/types';

/**
 * A marker and a word, never a coloured pill.
 * neutral/assistant: hollow ring (the assistant is handling it) · needs: violet diamond, semibold (the owner must act)
 * confirmed: green dot · info: lighter hollow ring, muted word · warning: amber · danger: red.
 */
withDefaults(defineProps<{ tone?: StatusTone; label?: string }>(), { tone: 'neutral', label: undefined });
</script>

<template>
  <span :class="['ov-status', `ov-status--${tone}`]"><slot>{{ label }}</slot></span>
</template>
