<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { useDebounceFn } from '@vueuse/core';
import {
  OvButton,
  OvCard,
  OvCheckbox,
  OvField,
  OvInput,
  OvPageHeader,
  OvSegmented,
  OvSkeleton,
  OvStatus,
  OvTabs,
  OvTextarea,
  useToast,
} from '@oraviq/ui';
import type { SiteSettingsDto, WidgetSettingsDto } from '@oraviq/shared';
import ErrorState from '@/components/ErrorState.vue';
import SitePreview from '@/components/SitePreview.vue';
import { api, errorMessage } from '@/api';
import { useAsync } from '@/composables/useAsync';
import { useReachable } from '@/composables/useReachable';
import { useAuthStore } from '@/stores/auth';
import { usePricingStore } from '@/stores/pricing';
import { SITES_URL, WIDGETS_URL } from '@/lib/env';

const auth = useAuthStore();
const pricing = usePricingStore();
const { toast } = useToast();

const tab = ref<'site' | 'widgets'>('site');
const tabs = [
  { value: 'site', label: 'Free website' },
  { value: 'widgets', label: 'Widgets for your own site', count: 2 },
];

const site = useAsync(() => api.site.get());
const widgets = useAsync(() => api.widgets.get());
const reviews = useAsync(() => api.reviews.list({ source: ['google'] }));
const sitesUp = useReachable(SITES_URL);
const widgetsUp = useReachable(WIDGETS_URL);
onMounted(() => void pricing.load());

const pk = computed(() => widgets.data.value?.publishableKey ?? null);

/* ---------------------------------------------------------------- site settings (saved as you type) */

type SiteForm = Pick<SiteSettingsDto, 'headline' | 'intro' | 'accentColor' | 'sections'>;
const form = reactive<SiteForm>({ headline: '', intro: '', accentColor: '#1F6B4F', sections: { prices: true, how: true, area: true, reviews: true, booking: true, chat: true } });
const saveState = ref<'saved' | 'saving' | 'unsaved' | 'error'>('saved');
const frameVersion = ref(0);
watch(
  () => site.data.value,
  (s, prev) => {
    if (!s || prev) return; // only the first load fills the form
    Object.assign(form, { headline: s.headline, intro: s.intro, accentColor: s.accentColor, sections: { ...s.sections } });
  },
  { immediate: true },
);

async function persistSite(): Promise<boolean> {
  saveState.value = 'saving';
  try {
    site.set(await api.site.save({ headline: form.headline, intro: form.intro, accentColor: form.accentColor, sections: { ...form.sections } }));
    saveState.value = 'saved';
    frameVersion.value++;
    return true;
  } catch (e) {
    saveState.value = 'error';
    toast(errorMessage(e), { tone: 'danger' });
    return false;
  }
}
const autosave = useDebounceFn(persistSite, 700);
function changed() {
  saveState.value = 'unsaved';
  void autosave();
}

const COLORS: Array<[string, string]> = [
  ['#1F6B4F', 'Green'],
  ['#24507A', 'Blue'],
  ['#B7470F', 'Orange'],
  ['#40454D', 'Graphite'],
];
async function pickColor(c: string) {
  form.accentColor = c;
  changed();
  // Widgets follow the site colour so both look like the hauler's brand.
  try {
    widgets.set(await api.widgets.save({ accentColor: c }));
  } catch {
    /* the site colour still saved */
  }
}

const SECTIONS: Array<[keyof SiteSettingsDto['sections'], string]> = [
  ['prices', 'Sizes and prices'],
  ['how', 'How it works'],
  ['area', 'Delivery area'],
  ['reviews', 'Reviews'],
  ['booking', 'Booking form'],
  ['chat', 'Chat button'],
];

const address = computed(() => {
  const s = site.data.value;
  if (!s) return '';
  return s.customDomain && s.customDomainStatus === 'active' ? s.customDomain : s.freeAddress;
});

const publishing = ref(false);
async function publish() {
  publishing.value = true;
  try {
    if (saveState.value !== 'saved' && !(await persistSite())) return;
    site.set(await api.site.publish());
    frameVersion.value++;
    toast(`Published to ${address.value}.`);
  } catch (e) {
    toast(errorMessage(e), { tone: 'danger' });
  } finally {
    publishing.value = false;
  }
}

const domain = ref('');
const domainError = ref<string | undefined>();
const connectingDomain = ref(false);
async function connectDomain() {
  const v = domain.value.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(v)) {
    domainError.value = 'Enter a domain like www.yourcompany.com.';
    return;
  }
  domainError.value = undefined;
  connectingDomain.value = true;
  try {
    site.set(await api.site.domain(v));
    domain.value = '';
    toast(`To finish, add a CNAME record for ${v}. We check it automatically.`, { tone: 'info', duration: 8000 });
  } catch (e) {
    toast(errorMessage(e), { tone: 'danger' });
  } finally {
    connectingDomain.value = false;
  }
}

const liveUrl = computed(() => (pk.value ? `${SITES_URL}/?key=${encodeURIComponent(pk.value)}&preview=1&v=${frameVersion.value}` : null));

/* ---------------------------------------------------------------- widgets */

const chat = reactive<Pick<WidgetSettingsDto, 'chatGreeting' | 'chatButtonLabel' | 'chatPosition'>>({ chatGreeting: '', chatButtonLabel: 'Get a price', chatPosition: 'right' });
const chatVersion = ref(0);
watch(
  () => widgets.data.value,
  (w, prev) => {
    if (!w || prev) return;
    Object.assign(chat, { chatGreeting: w.chatGreeting, chatButtonLabel: w.chatButtonLabel, chatPosition: w.chatPosition });
  },
  { immediate: true },
);
const widgetSaveState = ref<'saved' | 'saving' | 'unsaved'>('saved');
const saveWidgets = useDebounceFn(async () => {
  widgetSaveState.value = 'saving';
  try {
    widgets.set(await api.widgets.save({ ...chat }));
    chatVersion.value++;
    widgetSaveState.value = 'saved';
  } catch (e) {
    widgetSaveState.value = 'unsaved';
    toast(errorMessage(e), { tone: 'danger' });
  }
}, 700);
function chatChanged() {
  widgetSaveState.value = 'unsaved';
  void saveWidgets();
}
const position = computed({
  get: () => chat.chatPosition,
  set: (v: string) => {
    chat.chatPosition = v === 'left' ? 'left' : 'right';
    chatChanged();
  },
});

const accent = computed(() => widgets.data.value?.accentColor ?? form.accentColor);
const frameQuery = computed(() => (pk.value ? `key=${encodeURIComponent(pk.value)}&accent=${encodeURIComponent(accent.value)}&v=${chatVersion.value}` : ''));
const chatCode = computed(() => `<script async src="${WIDGETS_URL}/w.js" data-key="${pk.value ?? 'pk_…'}"${chat.chatPosition === 'left' ? ' data-position="left"' : ''}><\/script>`);
const bookCode = computed(() => `<div data-oraviq-booking></div>\n<script async src="${WIDGETS_URL}/w.js" data-key="${pk.value ?? 'pk_…'}" data-chat="false"><\/script>`);

async function copy(code: string) {
  try {
    await navigator.clipboard.writeText(code);
    toast('Copied. Paste it into your site.');
  } catch {
    toast('Copy is not allowed here. Select the code and copy it.', { tone: 'info' });
  }
}

/* The booking iframe reports its height (docs/widgets.md: { type: 'oraviq:resize', height }). */
const bookFrame = ref<HTMLIFrameElement | null>(null);
const bookHeight = ref(720);
function onMessage(e: MessageEvent) {
  if (e.origin !== new URL(WIDGETS_URL).origin) return;
  const d = e.data as { type?: string; height?: number } | null;
  if (d?.type === 'oraviq:resize' && typeof d.height === 'number' && e.source === bookFrame.value?.contentWindow) {
    bookHeight.value = Math.max(320, Math.min(1400, Math.ceil(d.height)));
  }
}
onMounted(() => window.addEventListener('message', onMessage));
onBeforeUnmount(() => window.removeEventListener('message', onMessage));

const saveLabel = (s: string) => ({ saved: 'All changes saved', saving: 'Saving', unsaved: 'Saving soon', error: 'Not saved' })[s] ?? '';
</script>

<template>
  <OvPageHeader title="Website & widgets">
    A free website built from your prices and reviews, or two widgets for the site you already have. Both quote from your pricing rules and send orders to your inbox.
  </OvPageHeader>

  <OvTabs v-model="tab" :items="tabs" label="Website or widgets" style="margin-top: -8px">
    <template #default="{ value }">
      <!-- ------------------------------------------------------------ free website -->
      <div v-if="value === 'site'" class="web-grid" style="margin-top: var(--space-5)">
        <OvCard as="section" class="settings" aria-label="Website settings">
          <ErrorState v-if="site.status.value === 'error'" :message="site.error.value" @retry="site.run()" />
          <div v-else-if="!site.data.value" class="stack"><OvSkeleton :lines="2" /><OvSkeleton height="80" /><OvSkeleton height="120" /><OvSkeleton height="120" /></div>
          <template v-else>
            <div>
              <p class="label">Your site</p>
              <p style="margin-top: 4px; font-weight: 600; overflow-wrap: anywhere">{{ address }}</p>
              <p style="margin-top: 6px; display: flex; gap: 10px; flex-wrap: wrap">
                <span v-if="site.data.value.published" class="live">Live</span>
                <OvStatus v-else>Not published yet</OvStatus>
                <OvStatus v-if="site.data.value.customDomain && site.data.value.customDomainStatus === 'pending'" tone="warning">
                  {{ site.data.value.customDomain }}: waiting for DNS
                </OvStatus>
                <OvStatus v-if="site.data.value.customDomainStatus === 'error'" tone="danger">{{ site.data.value.customDomain }}: DNS not found</OvStatus>
              </p>
            </div>
            <form novalidate @submit.prevent="connectDomain">
              <OvField label="Use your own domain (optional)" :help="`Free on ${site.data.value.freeAddress}. Your own domain needs one DNS record; we show you which.`" :error="domainError">
                <div class="domain-row">
                  <OvInput v-model="domain" placeholder="www.yourcompany.com" autocomplete="off" />
                  <OvButton type="submit" variant="secondary" :loading="connectingDomain">Connect</OvButton>
                </div>
              </OvField>
            </form>
            <OvField label="Headline"><OvInput v-model="form.headline" @input="changed" /></OvField>
            <OvField label="Intro line"><OvTextarea v-model="form.intro" :rows="3" @input="changed" /></OvField>
            <div class="ov-field">
              <span class="label" style="color: var(--ink)" id="colour-l">Site colour</span>
              <div class="swatches" role="group" aria-labelledby="colour-l" style="margin-top: 6px">
                <button
                  v-for="[c, n] in COLORS"
                  :key="c"
                  type="button"
                  class="swatch"
                  :style="{ background: c }"
                  :aria-pressed="form.accentColor.toLowerCase() === c.toLowerCase()"
                  :aria-label="n"
                  @click="pickColor(c)"
                />
              </div>
              <p class="small muted" style="margin-top: 6px">Your site uses your colour. Oraviq stays in the background.</p>
            </div>
            <fieldset style="border: 0; padding: 0; margin: 0">
              <legend class="label" style="color: var(--ink); margin-bottom: 8px">Sections</legend>
              <div class="checks">
                <OvCheckbox v-for="[k, l] in SECTIONS" :key="k" v-model="form.sections[k]" :label="l" @update:model-value="changed" />
              </div>
            </fieldset>
            <p class="small muted">Prices, zones and reviews update by themselves when you change your pricing rules or get new reviews.</p>
            <div class="save-bar">
              <OvButton variant="primary" :loading="publishing" @click="publish">{{ site.data.value.published ? 'Publish changes' : 'Publish site' }}</OvButton>
              <span class="small muted" role="status">{{ saveLabel(saveState) }}</span>
            </div>
          </template>
        </OvCard>

        <div class="browser" aria-label="Website preview">
          <div class="browser-bar">
            <span class="browser-dots" aria-hidden="true"><span /><span /><span /></span>
            <span class="browser-url">https://{{ address || 'your-site.oraviq.site' }}</span>
            <OvButton v-if="sitesUp && liveUrl" :href="liveUrl" target="_blank" rel="noopener" variant="quiet" size="sm" icon-end="external">Open</OvButton>
          </div>
          <div v-if="sitesUp && liveUrl" class="browser-body">
            <iframe :key="liveUrl" :src="liveUrl" title="Your website, live preview" />
          </div>
          <SitePreview
            v-else-if="site.data.value"
            :site="{ ...site.data.value, ...form }"
            :tenant="auth.tenant"
            :table="pricing.table"
            :reviews="reviews.data.value?.items ?? []"
            :stats="reviews.data.value?.stats ?? null"
            :publishable-key="pk"
            :widgets-up="!!widgetsUp"
            :chat-position="chat.chatPosition"
            :chat-label="chat.chatButtonLabel || 'Get a price'"
          />
          <div v-else class="browser-body" style="padding: 28px"><OvSkeleton height="60" /><OvSkeleton :lines="4" style="margin-top: 24px" /></div>
        </div>
      </div>

      <!-- ------------------------------------------------------------ widgets -->
      <template v-else>
        <p class="small muted" style="margin: var(--space-5) 0">
          Paste the code into any page. WordPress, Wix, Squarespace and GoDaddy all accept a custom HTML block. The previews below work: try them.
        </p>
        <ErrorState v-if="widgets.status.value === 'error'" :message="widgets.error.value" @retry="widgets.run()" />
        <div v-else class="wg-grid">
          <OvCard as="section" class="settings" title="Chat widget">
            <template v-if="widgets.data.value">
              <OvField label="Greeting"><OvTextarea v-model="chat.chatGreeting" :rows="3" @input="chatChanged" /></OvField>
              <div class="form-row" style="grid-template-columns: 1fr auto; align-items: end">
                <OvField label="Button label"><OvInput v-model="chat.chatButtonLabel" @input="chatChanged" /></OvField>
                <div class="ov-field">
                  <span class="label" style="color: var(--ink)">Position</span>
                  <OvSegmented v-model="position" label="Position" :options="[{ value: 'left', label: 'Left' }, { value: 'right', label: 'Right' }]" style="margin-top: 6px" />
                </div>
              </div>
              <div class="mock-page" aria-label="Chat widget preview" :style="{ '--site': accent }">
                <i style="width: 40%" /><i style="width: 70%" /><i style="width: 55%" /><i style="width: 62%" />
                <div
                  v-if="widgetsUp && pk"
                  :style="{ position: 'absolute', bottom: '80px', [chat.chatPosition]: '20px', width: '340px', maxWidth: 'calc(100% - 40px)', height: '380px', borderRadius: '24px', overflow: 'hidden', boxShadow: '0 16px 40px rgba(64,69,77,.24)', background: 'var(--surface)' }"
                >
                  <iframe :key="frameQuery" class="frame" :src="`${WIDGETS_URL}/chat.html?${frameQuery}`" title="Chat widget preview" />
                </div>
                <div v-else class="small muted" style="position: absolute; top: 120px; left: 24px; right: 24px; text-align: center">
                  The live chat preview appears here when the widgets app is running.
                </div>
                <span :class="['launcher', { left: chat.chatPosition === 'left' }]" aria-hidden="true">{{ chat.chatButtonLabel || 'Get a price' }}</span>
              </div>
              <div>
                <div class="save-bar">
                  <span class="label">Embed code</span>
                  <OvButton variant="secondary" size="sm" icon="copy" @click="copy(chatCode)">Copy code</OvButton>
                </div>
                <pre class="code">{{ chatCode }}</pre>
              </div>
              <p class="small muted" role="status">{{ saveLabel(widgetSaveState) }}</p>
            </template>
            <div v-else class="stack"><OvSkeleton height="90" /><OvSkeleton height="300" /></div>
          </OvCard>

          <OvCard as="section" class="settings" title="Booking widget">
            <p class="small muted" style="margin-top: -12px">An instant price and a booking request in one form. It uses your site colour.</p>
            <div class="frame-wrap">
              <iframe v-if="widgetsUp && pk" ref="bookFrame" class="frame" :style="{ height: `${bookHeight}px` }" :src="`${WIDGETS_URL}/book.html?${frameQuery}`" title="Booking widget preview" />
              <div v-else class="site-cta" style="border: 0">
                <b style="color: var(--ink)">Booking widget preview</b>
                <p class="small" style="margin-top: 6px">{{ widgetsUp === null ? 'Checking the widgets app' : 'Start the widgets app to try the live form here.' }}</p>
              </div>
            </div>
            <div>
              <div class="save-bar">
                <span class="label">Embed code</span>
                <OvButton variant="secondary" size="sm" icon="copy" @click="copy(bookCode)">Copy code</OvButton>
              </div>
              <pre class="code">{{ bookCode }}</pre>
            </div>
          </OvCard>
        </div>
      </template>
    </template>
  </OvTabs>
</template>
