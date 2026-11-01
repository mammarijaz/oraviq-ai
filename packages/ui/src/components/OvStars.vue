<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(defineProps<{ rating: number; max?: number; size?: number; label?: string }>(), { max: 5, size: 15, label: undefined });

const filled = computed(() => Math.max(0, Math.min(props.max, Math.round(props.rating))));
const name = computed(() => props.label ?? `${Number.isInteger(props.rating) ? props.rating : props.rating.toFixed(1)} out of ${props.max} stars`);
const STAR = 'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z';
</script>

<template>
  <span class="ov-stars" role="img" :aria-label="name">
    <svg v-for="n in max" :key="n" viewBox="0 0 24 24" :width="size" :height="size" aria-hidden="true" focusable="false">
      <path :d="STAR" :fill="n <= filled ? 'currentColor' : 'none'" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" />
    </svg>
  </span>
</template>
