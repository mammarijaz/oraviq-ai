import { describe, expect, it } from 'vitest';
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils';
import { nextTick } from 'vue';
import OvDropdown from '../src/components/OvDropdown.vue';
import type { DropdownOption } from '../src';

const channels: DropdownOption[] = [
  { value: 'phone', label: 'Phone call', count: 3, icon: 'phone' },
  { value: 'sms', label: 'Text message', count: 6, icon: 'chat' },
  { value: 'web_chat', label: 'Website chat', count: 2 },
  { value: 'facebook', label: 'Facebook', count: 2, disabled: true },
];

const panel = () => document.body.querySelector<HTMLElement>('.ov-dd__panel');
const options = () => Array.from(document.body.querySelectorAll<HTMLElement>('.ov-dd__opt'));
const settle = async () => {
  await flushPromises();
  await nextTick();
};

describe('OvDropdown (multi filter)', () => {
  it('opens a teleported listbox and toggles options live', async () => {
    const w = mount(OvDropdown, { attachTo: document.body, props: { label: 'Channel', multiple: true, options: channels, modelValue: [] as string[] } });
    const trigger = w.get('.ov-dd__trigger');
    expect(trigger.attributes('aria-haspopup')).toBe('listbox');
    expect(trigger.attributes('aria-expanded')).toBe('false');
    expect(w.get('.ov-dd__value').text()).toBe('All');

    await trigger.trigger('click');
    await settle();
    expect(panel()).not.toBeNull();
    expect(panel()!.parentElement).toBe(document.body);
    expect(trigger.attributes('aria-expanded')).toBe('true');
    const list = document.body.querySelector('[role="listbox"]')!;
    expect(list.getAttribute('aria-multiselectable')).toBe('true');
    expect(trigger.attributes('aria-controls')).toBe(list.id);

    options()[1]!.click();
    await settle();
    expect(w.emitted('update:modelValue')!.at(-1)).toEqual([['sms']]);
    // Live apply: the panel stays open.
    expect(panel()).not.toBeNull();
  });

  it('summarises, selects all (skipping disabled), clears and closes with Done', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w: VueWrapper<any> = mount(OvDropdown, {
      attachTo: document.body,
      props: {
        label: 'Channel',
        multiple: true,
        options: channels,
        modelValue: ['sms', 'phone'] as string[],
        'onUpdate:modelValue': (v: unknown) => {
          void w.setProps({ modelValue: v });
        },
      },
    });
    // Option order, first label + the rest.
    expect(w.get('.ov-dd__value').text()).toBe('Phone call +1');
    expect(w.get('.ov-dd__count').text()).toBe('2');
    expect(w.classes()).toContain('ov-dd--active');

    await w.get('.ov-dd__trigger').trigger('click');
    await settle();
    const [selectAll, clear, done] = Array.from(panel()!.querySelectorAll<HTMLButtonElement>('.ov-dd__foot button'));
    expect(selectAll!.textContent).toBe('Select all');

    selectAll!.click();
    await settle();
    expect(w.emitted('update:modelValue')!.at(-1)).toEqual([['phone', 'sms', 'web_chat']]);

    clear!.click();
    await settle();
    expect(w.emitted('update:modelValue')!.at(-1)).toEqual([[]]);
    expect(w.get('.ov-dd__value').text()).toBe('All');
    expect(clear!.disabled).toBe(true);

    done!.click();
    await settle();
    expect(panel()).toBeNull();
    expect(document.activeElement).toBe(w.get('.ov-dd__trigger').element);
  });

  it('works by keyboard: ArrowDown opens, arrows move, Enter ticks, Escape closes and refocuses', async () => {
    const w = mount(OvDropdown, { attachTo: document.body, props: { label: 'Channel', multiple: true, options: channels, modelValue: [] as string[] } });
    const trigger = w.get('.ov-dd__trigger');
    (trigger.element as HTMLElement).focus();
    await trigger.trigger('keydown', { key: 'ArrowDown' });
    await settle();
    expect(panel()).not.toBeNull();
    const list = document.body.querySelector<HTMLElement>('[role="listbox"]')!;
    const first = options()[0]!;
    expect(list.getAttribute('aria-activedescendant')).toBe(first.id);

    list.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    await settle();
    expect(list.getAttribute('aria-activedescendant')).toBe(options()[1]!.id);

    list.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await settle();
    expect(w.emitted('update:modelValue')!.at(-1)).toEqual([['sms']]);

    // End skips the disabled last option.
    list.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    await settle();
    expect(list.getAttribute('aria-activedescendant')).toBe(options()[2]!.id);

    const esc = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    list.dispatchEvent(esc);
    await settle();
    expect(panel()).toBeNull();
    expect(esc.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(trigger.element);
  });

  it('ignores disabled options', async () => {
    const w = mount(OvDropdown, { attachTo: document.body, props: { label: 'Channel', multiple: true, options: channels, modelValue: [] as string[] } });
    await w.get('.ov-dd__trigger').trigger('click');
    await settle();
    const fb = options()[3]!;
    expect(fb.getAttribute('aria-disabled')).toBe('true');
    fb.click();
    await settle();
    expect(w.emitted('update:modelValue')).toBeUndefined();
  });

  it('shows a search box above 7 options and filters', async () => {
    const many = Array.from({ length: 9 }, (_, i) => ({ value: `z${i}`, label: i === 4 ? 'Marietta' : `Zone ${i}` }));
    const w = mount(OvDropdown, { attachTo: document.body, props: { label: 'Area', multiple: true, options: many, modelValue: [] as string[] } });
    await w.get('.ov-dd__trigger').trigger('click');
    await settle();
    const q = document.body.querySelector<HTMLInputElement>('.ov-dd__q')!;
    expect(q).not.toBeNull();
    q.value = 'mari';
    q.dispatchEvent(new Event('input', { bubbles: true }));
    await settle();
    expect(options().map((o) => o.textContent?.trim())).toEqual(['Marietta']);
    q.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await settle();
    expect(w.emitted('update:modelValue')!.at(-1)).toEqual([['z4']]);
  });
});

describe('OvDropdown (single field)', () => {
  const sizes: DropdownOption[] = [
    { value: '10', label: '10-yard', hint: 'Bathroom remodel' },
    { value: '20', label: '20-yard', hint: 'Kitchen remodel' },
    { value: '30', label: '30-yard', hint: 'Whole-home cleanout' },
  ];

  it('shows the placeholder, chooses one option and closes', async () => {
    const w = mount(OvDropdown, { attachTo: document.body, props: { label: 'Dumpster size', variant: 'field', options: sizes, modelValue: null, placeholder: 'Choose a size' } });
    expect(w.classes()).toContain('ov-dd--field');
    expect(w.get('.ov-dd__value').text()).toBe('Choose a size');
    expect(w.get('.ov-dd__trigger').attributes('aria-label')).toBe('Dumpster size, Choose a size');

    await w.get('.ov-dd__trigger').trigger('click');
    await settle();
    expect(document.body.querySelector('[role="listbox"]')!.hasAttribute('aria-multiselectable')).toBe(false);
    expect(options()[1]!.querySelector('.ov-dd__hint')!.textContent).toBe('Kitchen remodel');
    options()[1]!.click();
    await settle();
    expect(w.emitted('update:modelValue')!.at(-1)).toEqual(['20']);
    expect(panel()).toBeNull();
    expect(document.activeElement).toBe(w.get('.ov-dd__trigger').element);
  });

  it('marks the chosen option and supports ArrowUp to open at the end', async () => {
    const w = mount(OvDropdown, { attachTo: document.body, props: { label: 'Dumpster size', variant: 'field', options: sizes, modelValue: '10' } });
    await w.get('.ov-dd__trigger').trigger('keydown', { key: 'ArrowUp' });
    await settle();
    const list = document.body.querySelector<HTMLElement>('[role="listbox"]')!;
    expect(list.getAttribute('aria-activedescendant')).toBe(options()[2]!.id);
    expect(options()[0]!.getAttribute('aria-selected')).toBe('true');
    list.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await settle();
    expect(w.emitted('update:modelValue')!.at(-1)).toEqual(['30']);
    expect(panel()).toBeNull();
  });
});

