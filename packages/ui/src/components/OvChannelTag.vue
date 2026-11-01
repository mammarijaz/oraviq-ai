<script setup lang="ts">
import { computed } from 'vue';
import OvIcon from './OvIcon.vue';
import { channelMeta } from '../utils/channels';

const props = defineProps<{
  /** A channel key from @oraviq/shared (sms, phone, web_chat, booking_form, facebook, instagram, whatsapp, email) or a display name. */
  channel: string;
  /** Override the label. */
  label?: string;
  /** Show the icon only (the label stays for screen readers). */
  iconOnly?: boolean;
}>();

const meta = computed(() => channelMeta(props.channel));
const text = computed(() => props.label ?? meta.value.label);
</script>

<template>
  <span class="ov-chan">
    <OvIcon :name="meta.icon" :size="14" />
    <span :class="{ 'ov-sr': iconOnly }">{{ text }}</span>
  </span>
</template>
