import { computed, ref, watch, type WritableComputedRef } from 'vue';

/**
 * v-model that also works uncontrolled, and whose update event is typed without `undefined`
 * (defineModel on an optional prop emits `T | undefined`, which breaks `v-model` on a non-optional ref
 * under strict templates).
 */
export function useModel<T>(getValue: () => T | undefined, emit: (value: T) => void, fallback: T): WritableComputedRef<T> {
  const local = ref(getValue() ?? fallback) as { value: T };
  watch(getValue, (v) => {
    if (v !== undefined) local.value = v;
  });
  return computed<T>({
    get: () => {
      const v = getValue();
      return v === undefined ? local.value : v;
    },
    set: (v: T) => {
      local.value = v;
      emit(v);
    },
  });
}
