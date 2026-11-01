import { ref } from 'vue';
import { useToast } from '@oraviq/ui';
import type { OrderDto, OrderStatus, RescheduleOrderRequest } from '@oraviq/shared';
import { api, errorMessage } from '@/api';
import { useInboxStore } from '@/stores/inbox';
import { useOrdersStore } from '@/stores/orders';
import { firstName, formatDay } from '@/lib/format';
import { nextStep } from '@/lib/status';

/** Confirm, deposit link, reschedule (with Undo) and status steps, with a toast for every result. */
export function useOrderActions() {
  const orders = useOrdersStore();
  const inbox = useInboxStore();
  const { toast } = useToast();
  /** order id → action in flight, for button spinners. */
  const busy = ref<Record<string, string | undefined>>({});

  function done(o: OrderDto) {
    inbox.applyOrderUpdated(o);
    if (o.conversationId && inbox.details[o.conversationId]) void inbox.fetchDetail(o.conversationId, { silent: true });
  }

  async function run<T>(id: string, what: string, fn: () => Promise<T>): Promise<T | null> {
    busy.value[id] = what;
    try {
      return await fn();
    } catch (e) {
      toast(errorMessage(e), { tone: 'danger' });
      return null;
    } finally {
      busy.value[id] = undefined;
    }
  }

  async function confirm(o: Pick<OrderDto, 'id'>) {
    const r = await run(o.id, 'confirm', () => orders.confirm(o.id));
    if (!r) return null;
    done(r);
    toast(r.depositUrl || r.depositRequested ? 'Order confirmed. The customer got a text with the deposit link.' : 'Order confirmed. The customer got a text.');
    return r;
  }

  async function sendDeposit(o: Pick<OrderDto, 'id' | 'depositRequested'>) {
    const resend = o.depositRequested;
    const r = await run(o.id, 'deposit', () => orders.sendDepositLink(o.id));
    if (!r) return null;
    done(r);
    toast(resend ? 'Deposit link sent again.' : 'Deposit link sent.');
    return r;
  }

  async function reschedule(o: OrderDto, req: RescheduleOrderRequest) {
    const prev = { deliveryDate: o.deliveryDate, deliveryWindow: o.deliveryWindow };
    const r = await run(o.id, 'reschedule', () => orders.reschedule(o.id, req));
    if (!r) return null;
    done(r);
    const day = formatDay(req.deliveryDate) || r.deliveryDateLabel;
    toast(`Moved to ${day}${req.notifyCustomer ? `. ${firstName(o.contact.name) || 'Customer'} texted.` : '.'}`, {
      action: prev.deliveryDate
        ? {
            label: 'Undo',
            onClick: async () => {
              // Undo = reschedule back to the previous day (and tell the customer again if we told them).
              const back = await run(o.id, 'reschedule', () =>
                orders.reschedule(o.id, { deliveryDate: prev.deliveryDate!, deliveryWindow: prev.deliveryWindow ?? undefined, notifyCustomer: req.notifyCustomer }),
              );
              if (back) {
                done(back);
                toast('Change undone.', { tone: 'info' });
              }
            },
          }
        : undefined,
    });
    return r;
  }

  async function advance(o: OrderDto, status?: OrderStatus, message?: string) {
    const step = status ? { status, done: message ?? 'Order updated.' } : nextStep(o);
    if (!step) return null;
    const r = await run(o.id, 'status', () => orders.setStatus(o.id, step.status));
    if (!r) return null;
    done(r);
    toast(step.done);
    return r;
  }

  /** Dev builds only: the mock checkout can be marked paid (POST /dev/payments/:sessionId/pay). */
  const demoTools = import.meta.env.DEV || import.meta.env.VITE_DEMO_TOOLS === 'true';
  const sessionOf = (o: Pick<OrderDto, 'depositUrl'>) => /\/c\/([^/?#]+)/.exec(o.depositUrl ?? '')?.[1] ?? null;
  async function markPaidDemo(o: OrderDto) {
    const session = sessionOf(o);
    if (!session) return null;
    const r = await run(o.id, 'paid', async () => {
      const res = await api.dev.payDeposit(session);
      if (!res.ok) throw new Error(res.message ?? 'That payment link is not a test link.');
      const fresh = await api.orders.get(o.id);
      orders.applyOrderUpdated(fresh);
      return fresh;
    });
    if (!r) return null;
    done(r);
    toast('Deposit marked paid (demo).');
    return r;
  }
  const canMarkPaid = (o: Pick<OrderDto, 'depositUrl' | 'depositPaid'>) => demoTools && !o.depositPaid && !!sessionOf(o);

  return { busy, confirm, sendDeposit, reschedule, advance, markPaidDemo, canMarkPaid };
}
