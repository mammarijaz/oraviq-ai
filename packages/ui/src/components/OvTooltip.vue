<script setup lang="ts">
import { TooltipArrow, TooltipContent, TooltipPortal, TooltipProvider, TooltipRoot, TooltipTrigger } from 'reka-ui';

/**
 * A small graphite bubble that explains the thing it is attached to, on hover and on keyboard focus (Reka Tooltip).
 * Escape hides it. The default slot is the trigger and must be one focusable element.
 * One or two short sentences; never put a required instruction or an action only in a tooltip.
 */
withDefaults(
  defineProps<{
    text?: string;
    side?: 'top' | 'bottom' | 'left' | 'right';
    align?: 'start' | 'center' | 'end';
    /** Open delay in ms. */
    delay?: number;
    disableClosingTrigger?: boolean;
    disabled?: boolean;
    teleportTo?: string | HTMLElement;
  }>(),
  { text: undefined, side: 'top', align: 'center', delay: 200, teleportTo: 'body' },
);
const open = defineModel<boolean>('open', { default: false });
</script>

<template>
  <TooltipProvider :delay-duration="delay" :skip-delay-duration="300">
    <TooltipRoot v-model:open="open" :disable-closing-trigger="disableClosingTrigger" :disabled="disabled">
      <TooltipTrigger as-child><slot /></TooltipTrigger>
      <TooltipPortal :to="teleportTo">
        <TooltipContent class="ov-tooltip" :side="side" :align="align" :side-offset="8" :collision-padding="8">
          <slot name="content">{{ text }}</slot>
          <TooltipArrow class="ov-tooltip__arrow" :width="12" :height="6" />
        </TooltipContent>
      </TooltipPortal>
    </TooltipRoot>
  </TooltipProvider>
</template>
