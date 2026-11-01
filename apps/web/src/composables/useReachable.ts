import { ref } from 'vue';

const cache = new Map<string, Promise<boolean>>();

/** Whether another local app (sites, widgets) answers, so we can embed it; otherwise we show our own preview. */
export function probe(url: string, timeoutMs = 1500): Promise<boolean> {
  let p = cache.get(url);
  if (!p) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), timeoutMs);
    p = fetch(url, { mode: 'no-cors', signal: ctl.signal, cache: 'no-store' })
      .then(() => true)
      .catch(() => false)
      .finally(() => clearTimeout(t));
    cache.set(url, p);
    // Re-check next time if it was down.
    void p.then((ok) => !ok && setTimeout(() => cache.delete(url), 10_000));
  }
  return p;
}

export function useReachable(url: string) {
  const ok = ref<boolean | null>(null);
  void probe(url).then((v) => (ok.value = v));
  return ok;
}
