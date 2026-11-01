import { ref } from 'vue';
import { useToast } from '@oraviq/ui';
import type { ChannelConnectionDto } from '@oraviq/shared';
import { api, errorMessage } from '@/api';

type ConnectChannel = ChannelConnectionDto['channel'];

const NAMES: Record<ConnectChannel, string> = {
  sms: 'Texting',
  phone: 'Phone number',
  facebook: 'Facebook Page',
  instagram: 'Instagram account',
  google: 'Google Business Profile',
  stripe: 'Stripe',
};

/** Connect buttons (Meta, Google, Stripe): mock providers connect at once; real ones return a redirect. */
export function useConnect() {
  const { toast } = useToast();
  const busy = ref<string | null>(null);

  async function connect(key: string, channels: ConnectChannel[]): Promise<boolean> {
    busy.value = key;
    try {
      const connected: string[] = [];
      for (const ch of channels) {
        const r = await api.connections.connect(ch);
        if ('redirectUrl' in r && r.redirectUrl) {
          toast(`Opening ${NAMES[ch]} to finish connecting.`, { tone: 'info' });
          window.location.assign(r.redirectUrl);
          return true;
        }
        const c = r as ChannelConnectionDto;
        if (c.status === 'connected' || c.status === 'pending') connected.push(c.externalName ? `${NAMES[ch]} (${c.externalName})` : NAMES[ch]);
      }
      toast(connected.length ? `${connected.join(' and ')} connected.` : 'Connection started. We will let you know when it is ready.');
      return true;
    } catch (e) {
      toast(errorMessage(e), { tone: 'danger' });
      return false;
    } finally {
      busy.value = null;
    }
  }

  return { busy, connect, NAMES };
}
