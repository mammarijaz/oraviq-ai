import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ROLES, type BusinessHours, type ChannelConnectionDto, type Role, type SetupStepDto, type TenantDto, type UserDto } from '@oraviq/shared';
import { Prisma, type Tenant } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'node:crypto';
import { displayPhone, normalizePhone } from '../../common/phone';
import { env } from '../../config/env';
import { ChannelRouter } from '../../integrations/channel-router';
import { ACCOUNT_CONNECT_ADAPTER, PAYMENTS_ADAPTER, TELEPHONY_ADAPTER, type AccountConnectAdapter, type PaymentsAdapter, type TelephonyAdapter } from '../../integrations/types';
import { DbService } from '../../prisma/db.service';
import type { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { DEFAULT_BUSINESS_HOURS, newPublishableKey, priceTableRules, receptionistDefaults, reviewRequestDefaults, siteDefaults, slugify, widgetDefaults } from './defaults';

type SystemTx = Omit<PrismaService, '$connect' | '$disconnect' | '$on' | '$transaction' | '$extends' | 'onModuleDestroy'>;

const CONNECTION_KINDS = ['sms', 'phone', 'facebook', 'instagram', 'google', 'stripe'] as const;

export function toTenantDto(t: Tenant): TenantDto {
  return {
    id: t.id,
    name: t.name,
    slug: t.slug,
    phone: t.phone,
    city: t.city,
    state: t.state,
    timezone: t.timezone,
    oraviqNumber: t.oraviqNumber,
    businessHours: (t.businessHours as unknown as BusinessHours) ?? DEFAULT_BUSINESS_HOURS,
  };
}

function validHours(h: unknown): h is BusinessHours {
  if (!h || typeof h !== 'object' || !Array.isArray((h as BusinessHours).days) || (h as BusinessHours).days.length !== 7) return false;
  return (h as BusinessHours).days.every((d, i) => d === null || (d.day === i && /^\d{2}:\d{2}$/.test(d.open) && /^\d{2}:\d{2}$/.test(d.close) && d.open < d.close));
}

/** Tenant profile, team, setup checklist, channel connections, and provisioning of new tenants. */
@Injectable()
export class TenantService {
  constructor(
    private readonly dbs: DbService,
    private readonly audit: AuditService,
    private readonly router: ChannelRouter,
    @Inject(TELEPHONY_ADAPTER) private readonly telephony: TelephonyAdapter,
    @Inject(PAYMENTS_ADAPTER) private readonly payments: PaymentsAdapter,
    @Inject(ACCOUNT_CONNECT_ADAPTER) private readonly connector: AccountConnectAdapter,
    private readonly jwt: JwtService,
  ) {}

  async uniqueSlug(base: string, tx: SystemTx = this.dbs.system): Promise<string> {
    let slug = base;
    for (let i = 2; await tx.tenant.findUnique({ where: { slug } }); i++) slug = `${base}-${i}`;
    for (let i = 2; await tx.siteSettings.findUnique({ where: { slug } }); i++) slug = `${base}-${i}`;
    return slug;
  }

  /** Registration: tenant, owner, sample price table, default settings, an Oraviq number. */
  async provision(input: { businessName: string; ownerName: string; email: string; password: string; phone?: string | null; city?: string | null; state?: string | null }) {
    const phone = input.phone ? normalizePhone(input.phone) : null;
    if (input.phone && !phone) throw new BadRequestException('Enter a 10-digit business phone number.');
    const email = input.email.trim().toLowerCase();
    if (await this.dbs.system.user.findUnique({ where: { email } })) throw new ConflictException('That email already has an account. Sign in instead.');
    const passwordHash = await bcrypt.hash(input.password, 10);
    const provider = this.router.defaultProvider();
    // Real numbers cost money, so sign-up doesn't buy one: the owner gets it from Setup (POST /setup/number).
    // Mock numbers are free, so demos and tests still get one straight away.
    const number = provider === 'mock' || env().PROVISION_NUMBER_ON_SIGNUP ? await this.buyNumber(phone) : null;
    return this.dbs.system.$transaction(async (tx) => {
      const slug = await this.uniqueSlug(slugify(input.businessName), tx as unknown as SystemTx);
      const tenant = await tx.tenant.create({
        data: {
          name: input.businessName.trim(),
          slug,
          phone,
          city: input.city?.trim() || null,
          state: input.state?.trim().toUpperCase() || null,
          timezone: 'America/New_York',
          businessHours: DEFAULT_BUSINESS_HOURS as unknown as Prisma.InputJsonValue,
          publishableKey: newPublishableKey(),
          oraviqNumber: number?.e164 ?? null,
          alertPhone: phone,
        },
      });
      const user = await tx.user.create({ data: { email, passwordHash, name: input.ownerName.trim(), phone } });
      await tx.membership.create({ data: { tenantId: tenant.id, userId: user.id, role: 'owner' } });
      await this.createDefaults(tx as unknown as SystemTx, tenant, { number, provider, transferNumber: phone });
      await tx.auditLog.create({ data: { tenantId: tenant.id, actorUserId: user.id, action: 'tenant.register', entityType: 'tenant', entityId: tenant.id } });
      return { tenant, user, role: 'owner' as Role };
    });
  }

  private async buyNumber(businessPhone: string | null) {
    const areaCode = businessPhone ? businessPhone.slice(2, 5) : null;
    let number = await this.telephony.provisionNumber({ tenantId: randomBytes(8).toString('hex'), areaCode });
    for (let i = 0; i < 8 && (await this.dbs.system.phoneNumber.findUnique({ where: { e164: number.e164 } })); i++) {
      number = await this.telephony.provisionNumber({ tenantId: randomBytes(8).toString('hex'), areaCode });
    }
    return number;
  }

  /** Setup: buy the tenant's Oraviq number on demand. Idempotent: returns the existing number if there is one. */
  async provisionOraviqNumber(): Promise<{ e164: string; display: string }> {
    const tenantId = this.dbs.tenantId;
    const tenant = await this.dbs.system.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    if (tenant.oraviqNumber) return { e164: tenant.oraviqNumber, display: displayPhone(tenant.oraviqNumber) };
    const number = await this.buyNumber(tenant.phone);
    await this.dbs.system.$transaction(async (tx) => {
      // Re-check inside the transaction so two clicks can't buy two numbers' worth of records.
      const fresh = await tx.tenant.findUniqueOrThrow({ where: { id: tenantId } });
      if (fresh.oraviqNumber) return;
      await tx.tenant.update({ where: { id: tenantId }, data: { oraviqNumber: number.e164 } });
      await tx.phoneNumber.create({ data: { tenantId, e164: number.e164, provider: number.provider, providerNumberId: number.providerNumberId, forwardingFrom: tenant.phone, registrationStatus: 'in_review', voiceRoute: 'receptionist' } });
      await tx.channelAccount.updateMany({ where: { tenantId, kind: { in: ['sms', 'phone'] } }, data: { status: 'connected', externalAccountId: number.providerNumberId, externalName: displayPhone(number.e164) } });
      await tx.auditLog.create({ data: { tenantId, action: 'number.provision', entityType: 'tenant', entityId: tenantId, data: { e164: number.e164 } } });
    });
    const after = await this.dbs.system.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    return { e164: after.oraviqNumber!, display: displayPhone(after.oraviqNumber) };
  }

  async createDefaults(tx: SystemTx, tenant: Tenant, opts: { number: { e164: string; provider: string; providerNumberId: string } | null; provider: string; transferNumber: string | null }): Promise<void> {
    const tenantId = tenant.id;
    await tx.priceTable.create({ data: { tenantId, version: 1, rules: priceTableRules() as unknown as Prisma.InputJsonValue } });
    await tx.receptionistSettings.create({ data: { tenantId, ...receptionistDefaults(tenant.name), transferNumber: opts.transferNumber } });
    await tx.reviewRequestSettings.create({ data: { tenantId, ...reviewRequestDefaults(tenant.name) } });
    const { _business, ...site } = siteDefaults(tenant.name, tenant.city);
    void _business;
    await tx.siteSettings.create({ data: { tenantId, slug: tenant.slug, ...site } });
    await tx.widgetSettings.create({ data: { tenantId, ...widgetDefaults(tenant.name) } });
    if (opts.number) await tx.phoneNumber.create({ data: { tenantId, e164: opts.number.e164, provider: opts.number.provider, providerNumberId: opts.number.providerNumberId, forwardingFrom: tenant.phone, registrationStatus: 'in_review', voiceRoute: 'receptionist' } });
    const mock = opts.provider === 'mock';
    for (const kind of CONNECTION_KINDS) {
      const connected = ((kind === 'sms' || kind === 'phone') && !!opts.number) || (kind === 'stripe' && this.payments.provider === 'mock');
      await tx.channelAccount.create({
        data: {
          tenantId,
          kind,
          provider: kind === 'stripe' ? this.payments.provider : opts.provider,
          status: connected ? 'connected' : 'not_connected',
          externalAccountId: (kind === 'sms' || kind === 'phone') && opts.number ? opts.number.providerNumberId : null,
          externalName: (kind === 'sms' || kind === 'phone') && opts.number ? displayPhone(opts.number.e164) : kind === 'stripe' && connected ? (mock ? 'Test payments' : null) : null,
        },
      });
    }
  }

  async get(): Promise<TenantDto> {
    const t = await this.dbs.system.tenant.findUnique({ where: { id: this.dbs.tenantId } });
    if (!t) throw new NotFoundException('Tenant not found.');
    return toTenantDto(t);
  }

  async update(body: Partial<TenantDto>): Promise<TenantDto> {
    const data: Prisma.TenantUpdateInput = {};
    if (body.name !== undefined) {
      if (!String(body.name).trim()) throw new BadRequestException('Enter the business name.');
      data.name = String(body.name).trim();
    }
    if (body.phone !== undefined) {
      const p = body.phone ? normalizePhone(body.phone) : null;
      if (body.phone && !p) throw new BadRequestException('Enter a 10-digit phone number.');
      data.phone = p;
    }
    if (body.city !== undefined) data.city = body.city?.trim() || null;
    if (body.state !== undefined) data.state = body.state?.trim().toUpperCase() || null;
    if (body.timezone !== undefined) {
      try {
        new Intl.DateTimeFormat('en-US', { timeZone: body.timezone });
      } catch {
        throw new BadRequestException('Unknown time zone.');
      }
      data.timezone = body.timezone;
    }
    if (body.businessHours !== undefined) {
      if (!validHours(body.businessHours)) throw new BadRequestException('Business hours need 7 days (Sunday first), each closed or with open before close as HH:MM.');
      data.businessHours = body.businessHours as unknown as Prisma.InputJsonValue;
    }
    const t = await this.dbs.system.tenant.update({ where: { id: this.dbs.tenantId }, data });
    await this.audit.log('tenant.update', 'tenant', t.id, Object.keys(data).reduce((a, k) => ({ ...a, [k]: true }), {}));
    return toTenantDto(t);
  }

  async team(): Promise<UserDto[]> {
    const ms = await this.dbs.db.membership.findMany({ include: { user: true }, orderBy: { createdAt: 'asc' } });
    return ms.map((m) => ({ id: m.user.id, name: m.user.name, email: m.user.email, role: m.role, phone: m.user.phone }));
  }

  async invite(body: { name: string; email: string; role: Role }): Promise<UserDto> {
    const email = String(body.email ?? '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new BadRequestException('Enter a valid email.');
    if (!String(body.name ?? '').trim()) throw new BadRequestException('Enter their name.');
    if (!ROLES.includes(body.role) || body.role === 'owner') throw new BadRequestException('Role must be admin, dispatcher or staff.');
    let user = await this.dbs.system.user.findUnique({ where: { email } });
    if (user && (await this.dbs.db.membership.findFirst({ where: { userId: user.id } }))) throw new ConflictException('They are already on your team.');
    if (!user) {
      // Invited users set their password from the invite link; until then the hash is unusable.
      user = await this.dbs.system.user.create({ data: { email, name: body.name.trim(), passwordHash: `!invited:${randomBytes(16).toString('hex')}` } });
    }
    await this.dbs.db.membership.create({ data: { tenantId: this.dbs.tenantId, userId: user.id, role: body.role } });
    await this.audit.log('team.invite', 'user', user.id, { email, role: body.role });
    return { id: user.id, name: user.name, email: user.email, role: body.role, phone: user.phone };
  }

  /* ------------------------------------------------------------------ setup + connections */

  async connections(): Promise<ChannelConnectionDto[]> {
    const rows = await this.dbs.db.channelAccount.findMany();
    return CONNECTION_KINDS.map((kind) => {
      const r = rows.find((x) => x.kind === kind);
      return { channel: kind, provider: r?.provider ?? 'mock', status: r?.status ?? 'not_connected', externalName: r?.externalName ?? null };
    });
  }

  async connect(kind: string): Promise<ChannelConnectionDto | { redirectUrl: string }> {
    if (!(CONNECTION_KINDS as readonly string[]).includes(kind)) throw new BadRequestException(`Unknown connection "${kind}".`);
    const tenant = await this.dbs.system.tenant.findUniqueOrThrow({ where: { id: this.dbs.tenantId } });
    const row = await this.dbs.db.channelAccount.findFirst({ where: { kind: kind as any } });
    if (kind === 'stripe' && this.payments.provider === 'stripe') {
      // Signed, short-lived state so the callback can't be pointed at another tenant.
      const state = this.jwt.sign({ tid: tenant.id, purpose: 'stripe_connect' }, { expiresIn: 900 });
      const url = this.payments.connectUrl({ tenantId: tenant.id, state, redirectUri: `${env().PUBLIC_API_URL}/api/v1/connections/stripe/callback` });
      if (url) return { redirectUrl: url };
    }
    const provider = kind === 'stripe' ? this.payments.provider : row?.provider ?? this.router.defaultProvider();
    if (provider !== 'mock' && (kind === 'facebook' || kind === 'instagram' || kind === 'google')) {
      const sms = await this.dbs.db.channelAccount.findFirst({ where: { kind: 'sms' } });
      const profileId = ((sms?.metadata ?? {}) as { profileId?: string }).profileId ?? null;
      const url = await this.connector.connectUrl({ tenantId: tenant.id, kind, redirectUrl: `${env().WEB_URL}/setup?connected=${kind}`, profileId });
      if (url) {
        await this.dbs.db.channelAccount.updateMany({ where: { kind }, data: { status: 'pending', provider } });
        return { redirectUrl: url };
      }
    }
    const names: Record<string, string> = { facebook: `${tenant.name} (Facebook Page)`, instagram: `@${tenant.slug.replace(/-/g, '.')}`, google: `${tenant.name} (Google Business Profile)`, stripe: 'Test payments', sms: displayPhone(tenant.oraviqNumber), phone: displayPhone(tenant.oraviqNumber) };
    const data = { status: 'connected' as const, provider, externalName: names[kind], externalAccountId: row?.externalAccountId ?? `mock_${kind}_${tenant.id.slice(0, 8)}` };
    const updated = row
      ? await this.dbs.db.channelAccount.update({ where: { id: row.id }, data })
      : await this.dbs.db.channelAccount.create({ data: { tenantId: tenant.id, kind: kind as any, ...data } });
    await this.audit.log('connection.connect', 'channel_account', updated.id, { kind, provider });
    return { channel: updated.kind, provider: updated.provider, status: updated.status, externalName: updated.externalName };
  }

  /** Stripe Connect OAuth callback (Standard accounts). */
  async completeStripeConnect(code: string, state: string): Promise<string> {
    let tid: string;
    try {
      const p = this.jwt.verify<{ tid: string; purpose: string }>(state);
      if (p.purpose !== 'stripe_connect') throw new Error('wrong purpose');
      tid = p.tid;
    } catch {
      throw new UnauthorizedException('This Stripe link has expired. Try connecting again.');
    }
    if (!this.payments.completeConnect) throw new BadRequestException('Stripe is not configured.');
    const accountId = await this.payments.completeConnect(code);
    await this.dbs.system.channelAccount.upsert({
      where: { tenantId_kind: { tenantId: tid, kind: 'stripe' } },
      create: { tenantId: tid, kind: 'stripe', provider: 'stripe', status: 'connected', externalAccountId: accountId, externalName: accountId },
      update: { provider: 'stripe', status: 'connected', externalAccountId: accountId, externalName: accountId },
    });
    await this.dbs.system.auditLog.create({ data: { tenantId: tid, action: 'connection.connect', entityType: 'channel_account', entityId: null, data: { kind: 'stripe', accountId } } });
    return `${env().WEB_URL}/setup?connected=stripe`;
  }

  async setup(): Promise<SetupStepDto[]> {
    const db = this.dbs.db;
    const tenant = await this.dbs.system.tenant.findUniqueOrThrow({ where: { id: this.dbs.tenantId } });
    const [price, rcp, numbers, conns, site, forwardedCalls] = await Promise.all([
      db.priceTable.count(),
      db.receptionistSettings.findFirst(),
      db.phoneNumber.findMany(),
      db.channelAccount.findMany(),
      db.siteSettings.findFirst(),
      db.call.count({ where: { isTest: false } }),
    ]);
    const conn = (k: string) => conns.find((c) => c.kind === k)?.status === 'connected';
    const num = numbers[0];
    const n = displayPhone(tenant.oraviqNumber);
    const digits = (tenant.oraviqNumber ?? '').replace(/\D/g, '').slice(-10);
    const freeAddress = site ? `${site.slug}.${env().SITES_BASE_DOMAIN}` : '';
    return [
      { key: 'business', title: 'Business details', description: 'Name, yard address, hours and the phone you want alerts on.', status: tenant.name && tenant.phone ? 'done' : 'todo', actionLabel: 'Edit', actionHref: '/settings' },
      { key: 'pricing', title: 'Pricing rules', description: 'Sizes, base prices, included tons, zones and item fees.', status: price ? 'done' : 'todo', actionLabel: 'Edit', actionHref: '/pricing' },
      tenant.oraviqNumber
        ? { key: 'number', title: 'Your Oraviq number', description: `${n} is reserved for you. Customers keep calling your usual number.`, status: 'done' }
        : { key: 'number', title: 'Your Oraviq number', description: 'Get a local number that answers the calls you miss and sends your texts. Customers keep calling your usual number.', status: 'todo', actionLabel: 'Get my number' },
      {
        key: 'forwarding',
        title: 'Forward unanswered calls',
        description: !tenant.oraviqNumber ? 'Once you have your Oraviq number, forward the calls you miss to it and make a test call.' : `On your business phone, forward calls you don't answer to ${n}, then make a test call. Verizon: dial *71 ${digits}. AT&T and T-Mobile: dial **004*${digits}#. Office phone systems: set "forward when unanswered" in the admin page. Codes vary by plan, so always test.`,
        status: forwardedCalls > 0 ? 'done' : 'todo',
        actionLabel: 'Run test call',
        actionHref: '/setup',
      },
      { key: 'receptionist', title: 'AI receptionist', description: 'Answers calls you miss with your greeting and your prices, and puts callers through to you when they ask.', status: rcp?.enabled ? 'done' : 'todo', actionLabel: 'Settings', actionHref: '/receptionist' },
      {
        key: 'texting_registration',
        title: 'Texting registration',
        description: 'US carriers require business texting to be registered (A2P 10DLC). We file it for you; approval usually takes a few days.',
        status: num?.registrationStatus === 'approved' ? 'done' : num?.registrationStatus === 'rejected' ? 'blocked' : num && num.registrationStatus !== 'not_started' ? 'in_review' : 'todo',
      },
      { key: 'meta', title: 'Connect Facebook and Instagram', description: 'Messages to your Facebook Page and Instagram account arrive in your inbox, and the assistant answers them.', status: conn('facebook') && conn('instagram') ? 'done' : 'todo', actionLabel: 'Connect', actionHref: '/settings' },
      { key: 'google', title: 'Connect your Google Business Profile', description: 'So you can read and reply to Google reviews here, and send review requests with your review link.', status: conn('google') ? 'done' : 'todo', actionLabel: 'Connect', actionHref: '/settings' },
      { key: 'website', title: 'Website', description: `Your free site ${site?.published ? 'is live' : 'is ready to publish'} at ${freeAddress}. Already have a site? Add the chat and booking widgets instead.`, status: site?.published ? 'done' : 'todo', actionLabel: 'Open', actionHref: '/website' },
      { key: 'payments', title: 'Take deposits', description: 'Connect Stripe so confirmed orders include a deposit link. Money goes straight to your account.', status: conn('stripe') ? 'done' : 'todo', actionLabel: 'Connect', actionHref: '/settings' },
    ];
  }

  async testCall(): Promise<{ ok: boolean; message: string }> {
    const tenant = await this.dbs.system.tenant.findUniqueOrThrow({ where: { id: this.dbs.tenantId } });
    if (!tenant.oraviqNumber) return { ok: false, message: 'You need an Oraviq number first.' };
    if (!tenant.phone) return { ok: false, message: 'Add your business phone in Business details first.' };
    const r = await this.telephony.placeTestCall({ from: displayPhone(tenant.phone), to: displayPhone(tenant.oraviqNumber) });
    await this.audit.log('setup.test_call', 'tenant', tenant.id, { ok: r.ok });
    return r;
  }
}
