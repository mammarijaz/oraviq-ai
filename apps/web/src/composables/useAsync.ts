import { ref, shallowRef, type Ref, type ShallowRef } from 'vue';
import { errorMessage } from '@/api';
import type { LoadStatus } from '@/stores/inbox';

export interface AsyncState<T> {
  data: ShallowRef<T | null>;
  status: Ref<LoadStatus>;
  error: Ref<string | null>;
  /** Load (or reload) the data. Keeps the old data on screen while reloading. */
  run: () => Promise<T | null>;
  /** Replace the data after a save, without a request. */
  set: (v: T) => void;
}

/** One request per screen section, with loading, error and retry. */
export function useAsync<T>(fn: () => Promise<T>, opts: { immediate?: boolean } = {}): AsyncState<T> {
  const data = shallowRef<T | null>(null);
  const status = ref<LoadStatus>('idle');
  const error = ref<string | null>(null);
  let seq = 0;

  async function run() {
    const mine = ++seq;
    if (data.value == null) status.value = 'loading';
    error.value = null;
    try {
      const v = await fn();
      if (mine !== seq) return data.value;
      data.value = v;
      status.value = 'ready';
      return v;
    } catch (e) {
      if (mine !== seq) return data.value;
      error.value = errorMessage(e);
      status.value = data.value == null ? 'error' : 'ready';
      return null;
    }
  }

  function set(v: T) {
    data.value = v;
    status.value = 'ready';
  }

  if (opts.immediate !== false) void run();
  return { data, status, error, run, set };
}
