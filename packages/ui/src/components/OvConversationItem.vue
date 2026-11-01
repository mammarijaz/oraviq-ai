<script setup lang="ts">
import OvStatus from './OvStatus.vue';
import OvChannelTag from './OvChannelTag.vue';
import type { StatusTone } from '../utils/types';

/**
 * A row in the inbox list: name and time, a two-line preview, the status and the channel. The open conversation
 * is lavender with the violet bar on the left. Renders a button; listen for click.
 */
withDefaults(
  defineProps<{
    name: string;
    time?: string;
    preview?: string;
    statusLabel?: string;
    statusTone?: StatusTone;
    /** Extra info statuses, e.g. ["Repeat"]. */
    tags?: string[];
    channel?: string;
    selected?: boolean;
    unread?: boolean;
  }>(),
  { time: undefined, preview: undefined, statusLabel: undefined, statusTone: 'neutral', tags: () => [], channel: undefined },
);
const emit = defineEmits<{ click: [event: MouseEvent] }>();
</script>

<template>
  <button type="button" :class="['ov-conv', { 'is-unread': unread }]" :aria-current="selected ? 'true' : undefined" @click="emit('click', $event)">
    <span class="ov-conv__top">
      <span class="ov-conv__name">{{ name }}<span v-if="unread" class="ov-sr"> (unread)</span></span>
      <span v-if="time" class="ov-conv__time">{{ time }}</span>
    </span>
    <span v-if="preview" class="ov-conv__prev">{{ preview }}</span>
    <span class="ov-conv__bottom">
      <span class="ov-conv__statuses">
        <slot name="status">
          <OvStatus v-if="statusLabel" :tone="statusTone">{{ statusLabel }}</OvStatus>
        </slot>
        <OvStatus v-for="t in tags" :key="t" tone="info">{{ t }}</OvStatus>
      </span>
      <OvChannelTag v-if="channel" :channel="channel" />
    </span>
  </button>
</template>
