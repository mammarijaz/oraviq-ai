import type { ComputedRef, InjectionKey } from 'vue';

export interface RadioGroupContext {
  name: ComputedRef<string>;
  value: ComputedRef<string | null>;
  disabled: ComputedRef<boolean>;
  select: (value: string) => void;
}

export const RADIO_GROUP_KEY: InjectionKey<RadioGroupContext> = Symbol('ov-radio-group');
