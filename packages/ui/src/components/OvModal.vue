<script setup lang="ts">
import { DialogClose, DialogContent, DialogDescription, DialogOverlay, DialogPortal, DialogRoot, DialogTitle, DialogTrigger } from 'reka-ui';
import OvIcon from './OvIcon.vue';
import { closeTopPopover, hasOpenPopover } from '../composables/usePopover';

/**
 * One short, focused task over the page ("Change delivery day"). Built on Reka Dialog: focus moves in and is trapped,
 * Escape and the close button cancel (Escape first closes an open dropdown or calendar inside), a press on the backdrop
 * closes, and focus returns to the opener. A bottom sheet with full-width buttons under 560px.
 * Footer: a quiet Cancel and one primary action named for what it does ("Save change", never "OK").
 */
const props = withDefaults(
  defineProps<{
    title: string;
    /** One line naming what is being changed: "Jasmine Carter · 20-yard". */
    subtitle?: string;
    size?: 'sm' | 'md' | 'lg';
    /** Close when the backdrop is pressed. */
    dismissible?: boolean;
    closeLabel?: string;
    /** CSS selector inside the modal to focus first (default: the first focusable element). */
    initialFocus?: string;
    teleportTo?: string | HTMLElement;
  }>(),
  { subtitle: undefined, size: 'sm', dismissible: true, closeLabel: 'Close', initialFocus: undefined, teleportTo: 'body' },
);
const open = defineModel<boolean>('open', { default: false });
const emit = defineEmits<{ close: [] }>();

function close() {
  open.value = false;
}

function onOpenChange(v: boolean) {
  open.value = v;
  if (!v) emit('close');
}

function onEscape(e: KeyboardEvent) {
  if (hasOpenPopover()) {
    e.preventDefault();
    closeTopPopover();
  }
}

function onPointerDownOutside(e: Event) {
  if (!props.dismissible) e.preventDefault();
}

function onOpenAutoFocus(e: Event) {
  if (!props.initialFocus) return;
  const el = (e.currentTarget as HTMLElement | null)?.querySelector<HTMLElement>(props.initialFocus);
  if (el) {
    e.preventDefault();
    el.focus();
  }
}

defineExpose({ close });
</script>

<template>
  <DialogRoot :open="open" @update:open="onOpenChange">
    <DialogTrigger v-if="$slots.trigger" as-child><slot name="trigger" /></DialogTrigger>
    <DialogPortal :to="teleportTo">
      <DialogOverlay class="ov-modal-overlay">
        <DialogContent
          :class="['ov-modal', `ov-modal--${size}`]"
          v-bind="subtitle ? {} : { 'aria-describedby': undefined }"
          @escape-key-down="onEscape"
          @pointer-down-outside="onPointerDownOutside"
          @open-auto-focus="onOpenAutoFocus"
        >
          <div class="ov-modal__box">
            <div class="ov-modal__head">
              <div>
                <DialogTitle class="ov-modal__title">{{ title }}</DialogTitle>
                <DialogDescription v-if="subtitle" class="ov-modal__sub">{{ subtitle }}</DialogDescription>
              </div>
              <DialogClose as-child>
                <button type="button" class="ov-modal__x" :aria-label="closeLabel"><OvIcon name="close" :size="16" /></button>
              </DialogClose>
            </div>
            <div class="ov-modal__body"><slot :close="close" /></div>
            <div v-if="$slots.footer" class="ov-modal__foot"><slot name="footer" :close="close" /></div>
          </div>
        </DialogContent>
      </DialogOverlay>
    </DialogPortal>
  </DialogRoot>
</template>
