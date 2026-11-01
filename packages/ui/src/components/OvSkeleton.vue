<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(
  defineProps<{
    width?: string | number;
    height?: string | number;
    radius?: 'sm' | 'md' | 'lg' | 'pill' | 'circle';
    /** Render this many text lines (the last one shorter) instead of one block. */
    lines?: number;
  }>(),
  { width: '100%', height: undefined, radius: 'sm', lines: 0 },
);

const len = (v: string | number | undefined) => (typeof v === 'number' ? `${v}px` : v);
const blockStyle = computed(() => ({ width: len(props.width), height: len(props.height ?? (props.lines ? 12 : 16)) }));
</script>

<template>
  <span v-if="lines > 0" class="ov-skeleton-lines" aria-hidden="true" :style="{ width: len(width) }">
    <span v-for="n in lines" :key="n" :class="['ov-skeleton', `ov-skeleton--${radius}`]" :style="{ width: n === lines && lines > 1 ? '62%' : '100%', height: len(height ?? 12) }" />
  </span>
  <span v-else :class="['ov-skeleton', `ov-skeleton--${radius}`]" aria-hidden="true" :style="blockStyle" />
</template>
