import { BadRequestException, Inject, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import type { SiteSettingsDto, WidgetSettingsDto } from '@oraviq/shared';
import { Prisma, type SiteSettings, type WidgetSettings } from '@prisma/client';
import { env } from '../../config/env';
import { DOMAINS_ADAPTER, type DomainsAdapter } from '../../integrations/types';
import { OutboxService } from '../../jobs/outbox.service';
import { DbService } from '../../prisma/db.service';
import { AuditService } from '../audit/audit.service';

export const DEFAULT_SECTIONS = { prices: true, how: true, area: true, reviews: true, booking: true, chat: true };
const SECTION_KEYS = Object.keys(DEFAULT_SECTIONS) as Array<keyof typeof DEFAULT_SECTIONS>;
const HEX = /^#[0-9a-f]{6}$/i;
const HOST = /^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;

/** The free hauler website and the embeddable widgets. */
@Injectable()
export class SiteService implements OnModuleInit {
  constructor(
    private readonly dbs: DbService,
    private readonly outbox: OutboxService,
    private readonly audit: AuditService,
    @Inject(DOMAINS_ADAPTER) private readonly domains: DomainsAdapter,
  ) {}

  onModuleInit(): void {
    this.outbox.registerDispatcher('site.purge', async () => {
      const s = await this.dbs.db.siteSettings.findFirst();
      if (!s) return;
      const hosts = [this.freeAddress(s.slug), ...(s.customDomain && s.customDomainStatus === 'active' ? [s.customDomain] : [])];
      await this.domains.purgeCache(hosts);
    });
  }

  freeAddress(slug: string): string {
    return `${slug}.${env().SITES_BASE_DOMAIN}`;
  }

  toSiteDto(s: SiteSettings): SiteSettingsDto {
    return {
      slug: s.slug,
      freeAddress: this.freeAddress(s.slug),
      customDomain: s.customDomain,
      customDomainStatus: s.customDomainStatus,
      published: s.published,
      headline: s.headline,
      intro: s.intro,
      accentColor: s.accentColor,
      sections: { ...DEFAULT_SECTIONS, ...((s.sections ?? {}) as object) },
    };
  }

  async siteRow(): Promise<SiteSettings> {
    const s = await this.dbs.db.siteSettings.findFirst();
    if (!s) throw new NotFoundException('Site settings missing.');
    return s;
  }

  async getSite(): Promise<SiteSettingsDto> {
    const s = await this.siteRow();
    if (s.customDomain && s.customDomainStatus === 'pending' && s.customHostnameId) {
      const st = await this.domains.getCustomHostname(s.customHostnameId).catch(() => null);
      if (st && st.status !== 'pending') return this.toSiteDto(await this.dbs.db.siteSettings.update({ where: { id: s.id }, data: { customDomainStatus: st.status } }));
    }
    return this.toSiteDto(s);
  }

  async updateSite(body: Partial<SiteSettingsDto>): Promise<SiteSettingsDto> {
    const s = await this.siteRow();
    const data: Prisma.SiteSettingsUpdateInput = {};
    if (body.headline !== undefined) {
      const h = String(body.headline).trim();
      if (!h || h.length > 120) throw new BadRequestException('The headline needs 1 to 120 characters.');
      data.headline = h;
    }
    if (body.intro !== undefined) {
      const i = String(body.intro).trim();
      if (i.length > 400) throw new BadRequestException('Keep the intro under 400 characters.');
      data.intro = i;
    }
    if (body.accentColor !== undefined) {
      if (!HEX.test(body.accentColor)) throw new BadRequestException('The colour must look like #1F6B4F.');
      data.accentColor = body.accentColor;
    }
    if (body.sections !== undefined) {
      const next = { ...DEFAULT_SECTIONS, ...((s.sections ?? {}) as object) } as Record<string, boolean>;
      for (const k of SECTION_KEYS) if (k in (body.sections ?? {})) next[k] = !!(body.sections as Record<string, unknown>)[k];
      data.sections = next;
    }
    if (body.slug !== undefined && body.slug !== s.slug) {
      const slug = String(body.slug).toLowerCase().trim();
      if (!/^[a-z0-9](?:[a-z0-9-]{1,40}[a-z0-9])$/.test(slug)) throw new BadRequestException('The site address can use letters, numbers and dashes.');
      const taken = await this.dbs.system.siteSettings.findUnique({ where: { slug } });
      if (taken) throw new BadRequestException('That site address is taken.');
      data.slug = slug;
    }
    const updated = await this.dbs.db.siteSettings.update({ where: { id: s.id }, data });
    await this.audit.log('site.update', 'site_settings', s.id, Object.keys(data).reduce((a, k) => ({ ...a, [k]: true }), {}));
    return this.toSiteDto(updated);
  }

  async publish(): Promise<SiteSettingsDto> {
    const s = await this.siteRow();
    const updated = await this.dbs.tx(async (tx) => {
      const u = await tx.siteSettings.update({ where: { id: s.id }, data: { published: true, publishedAt: new Date() } });
      await this.outbox.add(tx, this.dbs.tenantId, 'site.purge', { reason: 'publish' });
      await this.audit.log('site.publish', 'site_settings', s.id, {}, tx);
      return u;
    });
    await this.outbox.kick();
    return this.toSiteDto(updated);
  }

  async connectDomain(domain: string): Promise<SiteSettingsDto> {
    const host = String(domain ?? '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    if (!HOST.test(host)) throw new BadRequestException('Enter a domain like www.yourcompany.com.');
    if (host.endsWith(`.${env().SITES_BASE_DOMAIN}`)) throw new BadRequestException('That is already your free address.');
    const s = await this.siteRow();
    const taken = await this.dbs.system.siteSettings.findFirst({ where: { customDomain: host, NOT: { id: s.id } } });
    if (taken) throw new BadRequestException('That domain is connected to another account.');
    const ch = await this.domains.createCustomHostname(host);
    const updated = await this.dbs.db.siteSettings.update({ where: { id: s.id }, data: { customDomain: host, customHostnameId: ch.id, customDomainStatus: ch.status } });
    await this.audit.log('site.domain', 'site_settings', s.id, { domain: host, status: ch.status });
    return this.toSiteDto(updated);
  }

  /* ------------------------------------------------------------------ widgets */

  async widgetRow(): Promise<WidgetSettings> {
    const w = await this.dbs.db.widgetSettings.findFirst();
    if (!w) throw new NotFoundException('Widget settings missing.');
    return w;
  }

  async toWidgetDto(w: WidgetSettings): Promise<WidgetSettingsDto> {
    const t = await this.dbs.system.tenant.findUniqueOrThrow({ where: { id: w.tenantId } });
    return { publishableKey: t.publishableKey, chatGreeting: w.chatGreeting, chatButtonLabel: w.chatButtonLabel, chatPosition: w.chatPosition === 'left' ? 'left' : 'right', accentColor: w.accentColor };
  }

  async getWidgets(): Promise<WidgetSettingsDto> {
    return this.toWidgetDto(await this.widgetRow());
  }

  async updateWidgets(body: Partial<WidgetSettingsDto>): Promise<WidgetSettingsDto> {
    const w = await this.widgetRow();
    const data: Prisma.WidgetSettingsUpdateInput = {};
    if (body.chatGreeting !== undefined) {
      const g = String(body.chatGreeting).trim();
      if (!g) throw new BadRequestException('Write a greeting.');
      if (!/automated/i.test(g)) throw new BadRequestException("Keep \"automated assistant\" in the greeting so visitors know they're chatting with an assistant.");
      data.chatGreeting = g;
    }
    if (body.chatButtonLabel !== undefined) {
      const l = String(body.chatButtonLabel).trim();
      if (!l || l.length > 30) throw new BadRequestException('The button label needs 1 to 30 characters.');
      data.chatButtonLabel = l;
    }
    if (body.chatPosition !== undefined) {
      if (!['left', 'right'].includes(body.chatPosition)) throw new BadRequestException('Position must be left or right.');
      data.chatPosition = body.chatPosition;
    }
    if (body.accentColor !== undefined) {
      if (!HEX.test(body.accentColor)) throw new BadRequestException('The colour must look like #1F6B4F.');
      data.accentColor = body.accentColor;
    }
    const updated = await this.dbs.db.widgetSettings.update({ where: { id: w.id }, data });
    await this.audit.log('widgets.update', 'widget_settings', w.id, Object.keys(data).reduce((a, k) => ({ ...a, [k]: true }), {}));
    return this.toWidgetDto(updated);
  }
}
