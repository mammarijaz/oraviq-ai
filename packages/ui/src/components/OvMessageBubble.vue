<script setup lang="ts">
import type { MessageAuthor } from '../utils/types';

/**
 * A chat bubble. customer: left, white with a hairline; assistant: right, lavender; owner: right, graphite (a human reply
 * always stands out); system: a centred muted line ("Missed call, 6:40 p.m."). `meta` holds the time and channel.
 * Never shorten customer text.
 */
withDefaults(defineProps<{ author: MessageAuthor; text?: string; meta?: string; failed?: boolean }>(), { text: undefined, meta: undefined });
</script>

<template>
  <div :class="['ov-msg', `ov-msg--${author}`, { 'ov-msg--failed': failed }]">
    <slot>{{ text }}</slot>
    <span v-if="meta || failed" class="ov-msg__meta">
      {{ meta }}<template v-if="failed"><template v-if="meta"> · </template><span class="ov-msg__failed">Not delivered</span></template>
    </span>
  </div>
</template>
