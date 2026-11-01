import { readonly, shallowRef } from 'vue';

export type ToastTone = 'success' | 'info' | 'danger';

export interface ToastAction {
  /** Short verb, usually "Undo". */
  label: string;
  onClick: () => void;
}

export interface ToastOptions {
  tone?: ToastTone;
  action?: ToastAction;
  /** Milliseconds. Default 3200, or 6000 with an action. */
  duration?: number;
}

export interface ToastItem {
  id: number;
  message: string;
  tone: ToastTone;
  action?: ToastAction;
  duration: number;
}

export const TOAST_MAX = 3;

const items = shallowRef<ToastItem[]>([]);
const timers = new Map<number, ReturnType<typeof setTimeout>>();
let seq = 0;

function clear(id: number) {
  const t = timers.get(id);
  if (t) clearTimeout(t);
  timers.delete(id);
}

function dismiss(id: number) {
  clear(id);
  items.value = items.value.filter((t) => t.id !== id);
}

function arm(id: number) {
  const t = items.value.find((x) => x.id === id);
  if (!t) return;
  clear(id);
  timers.set(id, setTimeout(() => dismiss(id), t.duration));
}

/** Show a one-sentence, past-tense confirmation: toast('Moved to Tue, Nov 10. Customer texted.', { action: { label: 'Undo', onClick } }). */
function toast(message: string, opts: ToastOptions = {}): number {
  seq += 1;
  const item: ToastItem = {
    id: seq,
    message,
    tone: opts.tone ?? 'success',
    action: opts.action,
    duration: opts.duration ?? (opts.action ? 6000 : 3200),
  };
  let next = [...items.value, item];
  while (next.length > TOAST_MAX) {
    const old = next[0];
    if (old) clear(old.id);
    next = next.slice(1);
  }
  items.value = next;
  arm(item.id);
  return item.id;
}

/** Run a toast's action (e.g. Undo), then dismiss it. */
function runAction(id: number) {
  const t = items.value.find((x) => x.id === id);
  dismiss(id);
  t?.action?.onClick();
}

function dismissAll() {
  for (const t of items.value) clear(t.id);
  items.value = [];
}

const api = {
  toasts: readonly(items),
  toast,
  success: (message: string, opts: Omit<ToastOptions, 'tone'> = {}) => toast(message, { ...opts, tone: 'success' }),
  info: (message: string, opts: Omit<ToastOptions, 'tone'> = {}) => toast(message, { ...opts, tone: 'info' }),
  danger: (message: string, opts: Omit<ToastOptions, 'tone'> = {}) => toast(message, { ...opts, tone: 'danger' }),
  dismiss,
  dismissAll,
  runAction,
  /** Hover or focus pauses the timer… */
  pause: clear,
  /** …and leaving starts it again. */
  resume: arm,
};

/** The shared toast queue. Render <OvToaster /> once near the app root. */
export function useToast() {
  return api;
}
