<script setup lang="ts">
import OvIcon from './OvIcon.vue';
import { useToast } from '../composables/useToast';

/** Renders the toast queue from useToast(). Mount once near the app root. Announced politely to screen readers. */
withDefaults(defineProps<{ teleportTo?: string | HTMLElement }>(), { teleportTo: 'body' });
const { toasts, dismiss, runAction, pause, resume } = useToast();
const ICON = { success: 'check', info: 'info', danger: 'alert' } as const;
</script>

<template>
  <Teleport :to="teleportTo">
    <div class="ov-toasts" role="status" aria-live="polite" aria-atomic="false">
      <div
        v-for="t in toasts"
        :key="t.id"
        :class="['ov-toast', `ov-toast--${t.tone}`]"
        @mouseenter="pause(t.id)"
        @mouseleave="resume(t.id)"
        @focusin="pause(t.id)"
        @focusout="resume(t.id)"
      >
        <span class="ov-toast__icon" aria-hidden="true"><OvIcon :name="ICON[t.tone]" :size="14" /></span>
        <span class="ov-toast__msg">{{ t.message }}</span>
        <button v-if="t.action" type="button" class="ov-toast__action" @click="runAction(t.id)">{{ t.action.label }}</button>
        <button type="button" class="ov-toast__x" aria-label="Dismiss" @click="dismiss(t.id)"><OvIcon name="close" :size="16" /></button>
      </div>
    </div>
  </Teleport>
</template>
