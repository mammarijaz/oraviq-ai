import { onBeforeUnmount, ref, watch, type Ref } from 'vue';
import { useEventListener } from '@vueuse/core';

/**
 * Open popovers (dropdown and date panels), most recent last. OvModal reads this so Escape closes an
 * inner panel first, the same rule as the kit's native-dialog wrapper.
 */
const openLayers: Array<() => void> = [];

export function hasOpenPopover(): boolean {
  return openLayers.length > 0;
}

/** Closes the most recently opened popover; returns true when one was closed. */
export function closeTopPopover(): boolean {
  const close = openLayers[openLayers.length - 1];
  if (!close) return false;
  close();
  return true;
}

export type PopoverCloseReason = 'outside' | 'scroll';

export interface PopoverOptions {
  open: Ref<boolean>;
  /** The control's root (trigger + anything that counts as "inside"). */
  root: Ref<HTMLElement | null | undefined>;
  trigger: Ref<HTMLElement | null | undefined>;
  panel: Ref<HTMLElement | null | undefined>;
  /** Called when the panel should close because of an outside press or the trigger scrolling away. */
  onDismiss: (reason: PopoverCloseReason) => void;
  /** Fixed panel width; otherwise min-width = max(trigger width, minWidth). */
  width?: number;
  minWidth?: number;
  gap?: number;
}

/**
 * Viewport positioning for a teleported panel, ported from the kit's place(): below the trigger,
 * left-aligned and kept 8px inside the viewport, flipped above near the bottom of the screen.
 * The panel is position: fixed and lives in <body>, so cards and table wrappers never clip it.
 */
export function usePopover(o: PopoverOptions) {
  const side = ref<'bottom' | 'top'>('bottom');
  const gap = o.gap ?? 6;
  const edge = 8;

  function place() {
    const t = o.trigger.value;
    const p = o.panel.value;
    if (!t || !p || typeof window === 'undefined') return;
    const r = t.getBoundingClientRect();
    if (o.width) p.style.width = `${Math.min(o.width, window.innerWidth - edge * 2)}px`;
    else p.style.minWidth = `${Math.min(Math.max(r.width, o.minWidth ?? 240), window.innerWidth - edge * 2)}px`;
    const pw = p.offsetWidth;
    const ph = p.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left = Math.min(r.left, vw - pw - edge);
    left = Math.max(edge, left);
    let top = r.bottom + gap;
    let s: 'bottom' | 'top' = 'bottom';
    if (top + ph > vh - edge) {
      const above = r.top - ph - gap;
      if (above > edge) {
        top = above;
        s = 'top';
      } else if (r.top > vh - r.bottom) {
        // Neither side fits: use the roomier side and keep the panel on screen.
        top = Math.max(edge, above);
        s = 'top';
      } else {
        top = Math.max(edge, Math.min(top, vh - ph - edge));
      }
    }
    side.value = s;
    p.style.left = `${Math.round(left)}px`;
    p.style.top = `${Math.round(top)}px`;
    p.dataset.side = s;
  }

  function reflow() {
    if (!o.open.value) return;
    const t = o.trigger.value;
    if (!t) return;
    const r = t.getBoundingClientRect();
    if (r.bottom < 0 || r.top > window.innerHeight) o.onDismiss('scroll');
    else place();
  }

  const closer = () => o.onDismiss('outside');

  watch(
    o.open,
    (v) => {
      const i = openLayers.indexOf(closer);
      if (i !== -1) openLayers.splice(i, 1);
      if (v) {
        openLayers.push(closer);
        place();
      }
    },
    { flush: 'post', immediate: true },
  );

  onBeforeUnmount(() => {
    const i = openLayers.indexOf(closer);
    if (i !== -1) openLayers.splice(i, 1);
  });

  if (typeof window !== 'undefined') {
    useEventListener(window, 'resize', reflow, { passive: true });
    useEventListener(
      document,
      'scroll',
      (e: Event) => {
        const target = e.target as Node | null;
        if (target && o.panel.value && target instanceof Node && o.panel.value.contains(target)) return;
        reflow();
      },
      { capture: true, passive: true },
    );
    useEventListener(
      document,
      'pointerdown',
      (e: PointerEvent) => {
        if (!o.open.value) return;
        const target = e.target as Node | null;
        if (!target) return;
        if (o.root.value?.contains(target) || o.panel.value?.contains(target)) return;
        o.onDismiss('outside');
      },
      { capture: true },
    );
  }

  return { place, side };
}

/** Tabbable elements inside a container, in DOM order. */
export function tabbables(container: HTMLElement): HTMLElement[] {
  const sel = 'button:not([disabled]), [href], input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
  return Array.from(container.querySelectorAll<HTMLElement>(sel)).filter((el) => !el.hasAttribute('hidden') && el.tabIndex >= 0);
}

/**
 * Attributes for a teleported panel. `data-dismissable-layer` makes Reka layers (e.g. an OvModal) treat presses inside
 * the panel as inside their own content. (Panels also set pointer-events: auto, since a modal turns them off on <body>.)
 */
export const LAYER_ATTRS: Record<string, string> = { 'data-dismissable-layer': '' };
