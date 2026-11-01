import { describe, expect, it } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import OvDatePicker from '../src/components/OvDatePicker.vue';
import OvField from '../src/components/OvField.vue';

const settle = async () => {
  await flushPromises();
  await nextTick();
  await nextTick();
};
const day = (iso: string) => document.body.querySelector<HTMLButtonElement>(`.ov-date__day[data-day="${iso}"]`)!;
const active = () => (document.activeElement as HTMLElement | null)?.getAttribute('data-day');

describe('OvDatePicker', () => {
  // Monday, Nov 2 2026; min is Wednesday Nov 4.
  const base = { label: 'Delivery day', today: '2026-11-02', min: '2026-11-04' };

  it('shows the short label and an accessible name', () => {
    const w = mount(OvDatePicker, { attachTo: document.body, props: { ...base, modelValue: '2026-11-05' } });
    expect(w.get('.ov-date__trigger span').text()).toBe('Thu, Nov 5');
    expect(w.get('.ov-date__trigger').attributes('aria-label')).toBe('Delivery day, Thursday, November 5');
    expect(w.get('.ov-date__trigger').attributes('aria-haspopup')).toBe('dialog');
  });

  it('blocks days before min: struck through, not pickable, and hidden from quick picks', async () => {
    const w = mount(OvDatePicker, { attachTo: document.body, props: { ...base, modelValue: null } });
    await w.get('.ov-date__trigger').trigger('click');
    await settle();
    const dialog = document.body.querySelector('.ov-date__panel')!;
    expect(dialog.getAttribute('role')).toBe('dialog');
    expect(day('2026-11-03').getAttribute('aria-disabled')).toBe('true');
    expect(day('2026-11-02').getAttribute('aria-disabled')).toBe('true');
    expect(day('2026-11-02').classList.contains('is-today')).toBe(true);
    expect(day('2026-11-04').hasAttribute('aria-disabled')).toBe(false);
    // Opens on min because min is after today.
    expect(active()).toBe('2026-11-04');

    day('2026-11-03').click();
    await settle();
    expect(w.emitted('update:modelValue')).toBeUndefined();
    expect(document.body.querySelector('.ov-date__panel')).not.toBeNull();

    const quick = Array.from(document.body.querySelectorAll('.ov-date__quick button')).map((b) => b.textContent);
    expect(quick).toEqual(['Saturday']); // Today (Nov 2) and Tomorrow (Nov 3) are before min.

    day('2026-11-06').click();
    await settle();
    expect(w.emitted('update:modelValue')!.at(-1)).toEqual(['2026-11-06']);
    expect(document.body.querySelector('.ov-date__panel')).toBeNull();
  });

  it('moves focus with arrows, Page Up/Down, Home/End and closes on Escape', async () => {
    const w = mount(OvDatePicker, { attachTo: document.body, props: { ...base, modelValue: '2026-11-11' } });
    await w.get('.ov-date__trigger').trigger('click');
    await settle();
    expect(active()).toBe('2026-11-11');
    const key = async (k: string) => {
      document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
      await settle();
    };
    await key('ArrowRight');
    expect(active()).toBe('2026-11-12');
    await key('ArrowDown');
    expect(active()).toBe('2026-11-19');
    await key('PageDown');
    expect(active()).toBe('2026-12-19');
    expect(document.body.querySelector('.ov-date__title')!.textContent).toBe('December 2026');
    await key('Home');
    expect(active()).toBe('2026-12-13'); // Sunday
    await key('End');
    expect(active()).toBe('2026-12-19'); // Saturday
    await key('Escape');
    expect(document.body.querySelector('.ov-date__panel')).toBeNull();
    expect(document.activeElement).toBe(w.get('.ov-date__trigger').element);
  });

  it('is labelled by its OvField', async () => {
    const w = mount(
      {
        components: { OvField, OvDatePicker },
        template: '<OvField label="Pickup day" help="We pick up before noon."><OvDatePicker v-model="d" label="Pickup day" today="2026-11-02" /></OvField>',
        data: () => ({ d: '2026-11-07' }),
      },
      { attachTo: document.body },
    );
    const trigger = w.get('.ov-date__trigger');
    const label = w.get('label');
    expect(label.attributes('for')).toBe(trigger.attributes('id'));
    expect(trigger.attributes('aria-labelledby')).toContain(label.attributes('id'));
    expect(trigger.attributes('aria-describedby')).toBe(w.get('.ov-field__help').attributes('id'));
  });
});
