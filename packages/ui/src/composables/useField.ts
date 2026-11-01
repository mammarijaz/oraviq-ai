import { computed, inject, provide, useId, type ComputedRef, type InjectionKey } from 'vue';

/** What an OvField shares with the control inside it, so `for`, aria-describedby and aria-invalid wire up by themselves. */
export interface FieldContext {
  controlId: ComputedRef<string>;
  labelId: string;
  describedBy: ComputedRef<string | undefined>;
  invalid: ComputedRef<boolean>;
  required: ComputedRef<boolean>;
}

export const FIELD_KEY: InjectionKey<FieldContext> = Symbol('ov-field');

export function provideField(ctx: FieldContext): void {
  provide(FIELD_KEY, ctx);
}

export function useFieldContext(): FieldContext | null {
  return inject(FIELD_KEY, null);
}

/**
 * Resolves the id, describedby and invalid state for a form control, preferring explicit props,
 * then the surrounding OvField, then a generated id.
 */
export function useControl(props: { id?: string; invalid?: boolean }, prefix = 'ov') {
  const field = useFieldContext();
  const fallback = `${prefix}-${useId()}`;
  const id = computed(() => props.id ?? field?.controlId.value ?? fallback);
  const invalid = computed(() => !!props.invalid || !!field?.invalid.value);
  const describedBy = computed(() => field?.describedBy.value);
  const required = computed(() => !!field?.required.value);
  return { field, id, invalid, describedBy, required };
}
