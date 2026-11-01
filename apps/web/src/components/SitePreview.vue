<script setup lang="ts">
import { computed, ref } from 'vue';
import { OvIcon, OvStars } from '@oraviq/ui';
import { formatPhone, type ReviewDto, type ReviewStatsDto, type SiteSettingsDto, type TenantDto } from '@oraviq/shared';
import { activeSizes, formatMoney, formatTons, type PriceTable } from '@oraviq/pricing';
import { WIDGETS_URL } from '@/lib/env';

/** A faithful in-app preview of the hauler's free site, used when the sites app isn't reachable. */
const props = defineProps<{
  site: SiteSettingsDto;
  tenant: TenantDto | null;
  table: PriceTable | null;
  reviews: ReviewDto[];
  stats: ReviewStatsDto | null;
  publishableKey: string | null;
  widgetsUp: boolean;
  chatPosition: 'left' | 'right';
  chatLabel: string;
}>();

const S = computed(() => props.site.sections);
const name = computed(() => props.tenant?.name ?? 'Your business');
const phone = computed(() => (props.tenant?.phone ? formatPhone(props.tenant.phone) : ''));
const place = computed(() => [props.tenant?.city, props.tenant?.state].filter(Boolean).join(', '));
const sizes = computed(() => (props.table ? activeSizes(props.table) : []));
const zone1 = computed(() => props.table?.zones[0]?.name.toLowerCase() ?? 'zone 1');
const top = computed(() => props.reviews.filter((r) => r.source === 'google' && (r.rating ?? 0) >= 4 && r.text).slice(0, 3));
function zips(z: PriceTable['zones'][number]) {
  return z.zips.slice(0, 6).join(', ') + (z.zips.length > 6 ? ` and ${z.zips.length - 6} more` : '');
}
const query = computed(() => (props.publishableKey ? `key=${encodeURIComponent(props.publishableKey)}&accent=${encodeURIComponent(props.site.accentColor)}` : ''));

const scroller = ref<HTMLElement | null>(null);
function toBooking() {
  const el = scroller.value?.querySelector('#site-booking') as HTMLElement | null;
  el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
const chatOpen = ref(false);
defineExpose({ scroller });
</script>

<template>
  <div ref="scroller" class="browser-body">
  <div class="site" :style="{ '--site': site.accentColor }">
    <header class="site-head">
      <span class="site-brand"><i aria-hidden="true" />{{ name }}</span>
      <span style="display: flex; gap: 14px; align-items: center; flex-wrap: wrap">
        <span v-if="phone" class="small muted">{{ phone }}</span>
        <button v-if="S.booking" type="button" class="site-btn" style="min-height: 40px" @click="toBooking">Get a price</button>
      </span>
    </header>
    <section class="site-hero">
      <div class="site-wrap">
        <h2>{{ site.headline }}</h2>
        <p>{{ site.intro }}</p>
        <div class="actions">
          <button v-if="S.booking" type="button" class="site-btn" @click="toBooking">Get an instant price</button>
          <button v-if="S.chat" type="button" class="site-btn site-btn--ghost" @click="chatOpen = true">Ask a question</button>
        </div>
        <div v-if="S.reviews && stats?.googleRating" class="site-trust">
          <OvStars :rating="Math.round(stats.googleRating)" />
          <b style="color: var(--ink)">{{ stats.googleRating.toFixed(1) }} on Google</b> · {{ stats.googleCount }} reviews
        </div>
      </div>
    </section>
    <section v-if="S.prices && table" class="site-sec">
      <div class="site-wrap">
        <h3>Sizes and prices</h3>
        <p class="lead">Each price includes {{ table.includedDays }} days and delivery in our {{ zone1 }} area. Extra days are {{ formatMoney(table.extraDayCents) }} each.</p>
        <div class="size-grid">
          <div v-for="s in sizes" :key="s.yards" class="size-card">
            <b>{{ s.yards }}-yard</b>
            <div class="p">{{ formatMoney(s.baseCents) }}</div>
            <div class="small muted">{{ formatTons(s.includedTons) }} included</div>
            <div v-if="s.hint" class="small" style="margin-top: 8px">{{ s.hint }}</div>
          </div>
        </div>
      </div>
    </section>
    <section v-if="S.how" class="site-sec">
      <div class="site-wrap">
        <h3>How it works</h3>
        <p class="lead">Three steps, no paperwork.</p>
        <div class="steps3">
          <div><b>1. Get a price</b><span class="small muted">Online, by text or by phone, any time.</span></div>
          <div><b>2. We drop it off</b><span class="small muted">On your driveway or where you ask, on the day you pick.</span></div>
          <div><b>3. We haul it away</b><span class="small muted">Text us when you're done. Need more days? Just ask.</span></div>
        </div>
      </div>
    </section>
    <section v-if="S.area && table" class="site-sec">
      <div class="site-wrap">
        <h3>Where we deliver</h3>
        <p class="lead">Not sure if we reach you? Enter your ZIP in the price form.</p>
        <div class="zones">
          <div v-for="z in table.zones" :key="z.id" class="zone-line">
            <span><b>{{ z.name }}</b> <span class="small muted">· {{ zips(z) }}</span></span>
            <b>{{ z.feeCents ? `+${formatMoney(z.feeCents)}` : 'Free delivery' }}</b>
          </div>
        </div>
      </div>
    </section>
    <section v-if="S.reviews && top.length" class="site-sec">
      <div class="site-wrap">
        <h3>What customers say</h3>
        <p class="lead">Real reviews from Google.</p>
        <div class="site-reviews">
          <div v-for="r in top" :key="r.id" class="site-review">
            <OvStars :rating="r.rating ?? 5" />
            <p style="margin: 8px 0">{{ r.text }}</p>
            <b class="small">{{ r.author }}</b>
          </div>
        </div>
      </div>
    </section>
    <section v-if="S.booking" id="site-booking" class="site-sec">
      <div class="site-wrap">
        <iframe v-if="widgetsUp && publishableKey" class="frame" style="height: 760px; border-radius: 24px" :src="`${WIDGETS_URL}/book.html?${query}`" title="Booking form preview" loading="lazy" />
        <div v-else class="site-cta">
          <b style="color: var(--ink); font-size: 18px">Get an instant price</b>
          <p class="small" style="margin-top: 6px">Your booking form appears here, with prices from your pricing rules.</p>
        </div>
      </div>
    </section>
    <footer class="site-foot">
      <div class="site-wrap">{{ [name, place, phone].filter(Boolean).join(' · ') }} · Website by Oraviq AI</div>
    </footer>
  </div>
  </div>
  <template v-if="S.chat">
    <div v-if="chatOpen && widgetsUp && publishableKey" :style="{ position: 'absolute', bottom: '80px', [chatPosition]: '20px', width: '340px', height: '460px', maxWidth: 'calc(100% - 40px)', zIndex: 6, borderRadius: '24px', overflow: 'hidden', boxShadow: '0 16px 40px rgba(64,69,77,.24)' }">
      <iframe class="frame" :src="`${WIDGETS_URL}/chat.html?${query}`" title="Chat preview" />
    </div>
    <button type="button" :class="['launcher', { left: chatPosition === 'left' }]" :style="{ '--site': site.accentColor }" :aria-expanded="chatOpen" @click="chatOpen = !chatOpen">
      <OvIcon name="chat" :size="18" />{{ chatOpen ? 'Close chat' : chatLabel }}
    </button>
  </template>
</template>
