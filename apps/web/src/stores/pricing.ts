import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { PriceTableDto } from '@oraviq/shared';
import { api, errorMessage } from '@/api';
import type { LoadStatus } from './inbox';

/** The saved price table, shared by Pricing rules, Try it out (zone names) and the site preview. */
export const usePricingStore = defineStore('pricing', () => {
  const table = ref<PriceTableDto | null>(null);
  const status = ref<LoadStatus>('idle');
  const error = ref<string | null>(null);
  let inflight: Promise<PriceTableDto | null> | null = null;

  function load(force = false): Promise<PriceTableDto | null> {
    if (table.value && !force) return Promise.resolve(table.value);
    if (inflight) return inflight;
    if (!table.value) status.value = 'loading';
    error.value = null;
    inflight = api.pricing
      .get()
      .then((t) => {
        table.value = t;
        status.value = 'ready';
        return t;
      })
      .catch((e) => {
        error.value = errorMessage(e);
        if (!table.value) status.value = 'error';
        return null;
      })
      .finally(() => {
        inflight = null;
      });
    return inflight;
  }

  function set(t: PriceTableDto) {
    table.value = t;
    status.value = 'ready';
  }

  return { table, status, error, load, set };
});
