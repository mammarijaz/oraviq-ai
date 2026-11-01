import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import OvToaster from '../src/components/OvToaster.vue';
import { useToast } from '../src';

describe('useToast + OvToaster', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    useToast().dismissAll();
    vi.useRealTimers();
  });

  it('renders in a polite live region and runs the action (Undo) once', async () => {
    mount(OvToaster, { attachTo: document.body });
    const undo = vi.fn();
    const { toast } = useToast();
    toast('Moved to Tue, Nov 10. Customer texted.', { action: { label: 'Undo', onClick: undo } });
    await flushPromises();
    const region = document.body.querySelector('.ov-toasts')!;
    expect(region.getAttribute('role')).toBe('status');
    expect(region.getAttribute('aria-live')).toBe('polite');
    expect(region.querySelector('.ov-toast__msg')!.textContent).toBe('Moved to Tue, Nov 10. Customer texted.');
    const action = region.querySelector<HTMLButtonElement>('.ov-toast__action')!;
    expect(action.textContent).toBe('Undo');
    action.click();
    await flushPromises();
    expect(undo).toHaveBeenCalledTimes(1);
    expect(document.body.querySelectorAll('.ov-toast').length).toBe(0);
  });

  it('auto-dismisses after 3.2 s, or 6 s with an action, and pauses on hover', async () => {
    mount(OvToaster, { attachTo: document.body });
    const t = useToast();
    t.success('Review request texted to Priya.');
    t.toast('Order confirmed.', { action: { label: 'Undo', onClick: () => {} } });
    await flushPromises();
    expect(document.body.querySelectorAll('.ov-toast').length).toBe(2);
    vi.advanceTimersByTime(3300);
    await flushPromises();
    expect(t.toasts.value.map((x) => x.message)).toEqual(['Order confirmed.']);

    const el = document.body.querySelector('.ov-toast')!;
    el.dispatchEvent(new Event('mouseenter'));
    vi.advanceTimersByTime(10000);
    await flushPromises();
    expect(t.toasts.value.length).toBe(1);
    el.dispatchEvent(new Event('mouseleave'));
    vi.advanceTimersByTime(6100);
    await flushPromises();
    expect(t.toasts.value.length).toBe(0);
  });

  it('keeps at most three, dropping the oldest, and supports tones', async () => {
    mount(OvToaster, { attachTo: document.body });
    const t = useToast();
    ['One', 'Two', 'Three', 'Four'].forEach((m) => t.info(m));
    t.danger('Copy not allowed here.');
    await flushPromises();
    expect(t.toasts.value.map((x) => x.message)).toEqual(['Three', 'Four', 'Copy not allowed here.']);
    expect(document.body.querySelectorAll('.ov-toast--danger').length).toBe(1);
  });
});
