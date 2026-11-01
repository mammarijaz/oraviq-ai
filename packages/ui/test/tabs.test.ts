import { describe, expect, it } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { nextTick } from 'vue';
import OvTabs from '../src/components/OvTabs.vue';

const items = [
  { value: 'site', label: 'Free website' },
  { value: 'widgets', label: 'Widgets', count: 2 },
  { value: 'ads', label: 'Ads', disabled: true },
  { value: 'domain', label: 'Domain' },
];

describe('OvTabs', () => {
  it('renders a tablist with roving tabindex and a labelled panel', () => {
    const w = mount(OvTabs, {
      attachTo: document.body,
      props: { items, label: 'Website', modelValue: 'widgets' },
      slots: { default: '<p>Panel</p>' },
    });
    const tabs = w.findAll('[role="tab"]');
    expect(w.get('[role="tablist"]').attributes('aria-label')).toBe('Website');
    expect(tabs[1]!.attributes('aria-selected')).toBe('true');
    expect(tabs[1]!.attributes('tabindex')).toBe('0');
    expect(tabs[0]!.attributes('tabindex')).toBe('-1');
    expect(tabs[1]!.find('.ov-tabs__count').text()).toBe('2');
    expect(w.get('[role="tabpanel"]').attributes('aria-labelledby')).toBe(tabs[1]!.attributes('id'));
  });

  it('moves and selects with arrow keys, skipping disabled tabs and wrapping; Home and End jump', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w: VueWrapper<any> = mount(OvTabs, {
      attachTo: document.body,
      props: {
        items,
        label: 'Website',
        modelValue: 'widgets',
        'onUpdate:modelValue': (v: string | undefined) => {
          void w.setProps({ modelValue: v });
        },
      },
    });
    const tab = (i: number) => w.findAll('[role="tab"]')[i]!;
    await tab(1).trigger('keydown', { key: 'ArrowRight' });
    expect(w.emitted('update:modelValue')!.at(-1)).toEqual(['domain']); // skipped "Ads"
    await nextTick();
    await nextTick();
    expect(document.activeElement).toBe(tab(3).element);

    await tab(3).trigger('keydown', { key: 'ArrowRight' });
    expect(w.emitted('update:modelValue')!.at(-1)).toEqual(['site']); // wrapped

    await tab(0).trigger('keydown', { key: 'ArrowLeft' });
    expect(w.emitted('update:modelValue')!.at(-1)).toEqual(['domain']);

    await tab(3).trigger('keydown', { key: 'Home' });
    expect(w.emitted('update:modelValue')!.at(-1)).toEqual(['site']);

    await tab(0).trigger('keydown', { key: 'End' });
    expect(w.emitted('update:modelValue')!.at(-1)).toEqual(['domain']);
    expect(w.emitted('change')!.length).toBe(w.emitted('update:modelValue')!.length);
  });
});
