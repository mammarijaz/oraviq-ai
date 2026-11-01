import { Injectable } from '@nestjs/common';
import type { Channel, ConsentPurpose, ConsentSource } from '@oraviq/shared';
import { Prisma } from '@prisma/client';
import { normalizeAddress } from '../../common/phone';
import { DbService } from '../../prisma/db.service';
import type { TenantTx } from '../../prisma/tenant-prisma';

const PHONE_CHANNELS: Channel[] = ['sms', 'phone', 'booking_form', 'whatsapp'];

/** Contacts, their identities (one per way to reach them) and the consent ledger. */
@Injectable()
export class ContactsService {
  constructor(private readonly dbs: DbService) {}

  /** Identity channel used to store an address: phone numbers are stored once as `sms`. */
  private identityChannel(channel: Channel): Channel {
    return PHONE_CHANNELS.includes(channel) ? 'sms' : channel;
  }

  async findByAddress(channel: Channel, address: string, tx: TenantTx = this.dbs.db) {
    const ch = this.identityChannel(channel);
    const norm = normalizeAddress(ch, address);
    const where = ch === 'sms' ? { addressNormalized: norm, channel: { in: ['sms', 'phone'] as Channel[] } } : { addressNormalized: norm, channel: ch };
    const id = await tx.contactIdentity.findFirst({ where, include: { contact: { include: { identities: true } } } });
    return id?.contact ?? null;
  }

  /** Finds the contact behind an address, creating contact + identity when new. Race-safe on the unique identity. */
  async findOrCreate(channel: Channel, address: string, opts: { name?: string | null; displayAddress?: string | null } = {}, tx: TenantTx = this.dbs.db) {
    const existing = await this.findByAddress(channel, address, tx);
    if (existing) {
      if (opts.name && !existing.name) await tx.contact.update({ where: { id: existing.id }, data: { name: opts.name } });
      return existing;
    }
    const ch = this.identityChannel(channel);
    const norm = normalizeAddress(ch, address);
    try {
      return await tx.contact.create({
        data: {
          tenantId: this.dbs.tenantId,
          name: opts.name ?? null,
          identities: { create: [{ tenantId: this.dbs.tenantId, channel: ch, addressNormalized: norm, displayAddress: opts.displayAddress ?? null }] },
        },
        include: { identities: true },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        const again = await this.findByAddress(channel, address, tx);
        if (again) return again;
      }
      throw e;
    }
  }

  /** Adds an identity to a known contact (e.g. a phone number learned in web chat). */
  async addIdentity(contactId: string, channel: Channel, address: string, tx: TenantTx = this.dbs.db): Promise<void> {
    const ch = this.identityChannel(channel);
    const norm = normalizeAddress(ch, address);
    await tx.contactIdentity.upsert({
      where: { tenantId_channel_addressNormalized: { tenantId: this.dbs.tenantId, channel: ch, addressNormalized: norm } },
      create: { tenantId: this.dbs.tenantId, contactId, channel: ch, addressNormalized: norm },
      update: {},
    });
  }

  /* ------------------------------------------------------------------ consent ledger */

  async latestConsent(contactId: string, channel: Channel, purpose: ConsentPurpose = 'transactional', tx: TenantTx = this.dbs.db) {
    return tx.consent.findFirst({ where: { contactId, channel, purpose }, orderBy: [{ capturedAt: 'desc' }, { createdAt: 'desc' }] });
  }

  /** True when the contact's latest SMS consent record is a revocation (they replied STOP). */
  async isOptedOut(contactId: string, channel: Channel = 'sms', tx: TenantTx = this.dbs.db): Promise<boolean> {
    if (!PHONE_CHANNELS.includes(channel)) return false;
    const c = await this.latestConsent(contactId, 'sms', 'transactional', tx);
    return c?.status === 'revoked';
  }

  async grant(
    tx: TenantTx,
    input: { contactId: string; channel?: Channel; purpose?: ConsentPurpose; source: ConsentSource; evidence: Record<string, unknown>; textVersion?: string | null; capturedAt?: Date },
  ): Promise<void> {
    await tx.consent.create({
      data: {
        tenantId: this.dbs.tenantId,
        contactId: input.contactId,
        channel: input.channel ?? 'sms',
        purpose: input.purpose ?? 'transactional',
        status: 'granted',
        source: input.source,
        evidence: input.evidence as Prisma.InputJsonValue,
        textVersion: input.textVersion ?? null,
        capturedAt: input.capturedAt ?? new Date(),
      },
    });
  }

  /** Records implied consent from an inbound text, once (the customer started the conversation). */
  async ensureInboundConsent(tx: TenantTx, contactId: string, evidence: Record<string, unknown>): Promise<void> {
    const latest = await this.latestConsent(contactId, 'sms', 'transactional', tx);
    if (latest) return;
    await this.grant(tx, { contactId, source: 'inbound_message', evidence });
  }

  /** STOP: revokes every SMS purpose. Returns false if they were already opted out. */
  async revokeSms(tx: TenantTx, contactId: string, evidence: Record<string, unknown>): Promise<boolean> {
    const already = await this.isOptedOut(contactId, 'sms', tx);
    const now = new Date();
    await tx.consent.updateMany({ where: { contactId, channel: 'sms', status: 'granted', revokedAt: null }, data: { revokedAt: now } });
    for (const purpose of ['transactional', 'marketing'] as ConsentPurpose[]) {
      await tx.consent.create({
        data: { tenantId: this.dbs.tenantId, contactId, channel: 'sms', purpose, status: 'revoked', source: 'inbound_message', evidence: evidence as Prisma.InputJsonValue, capturedAt: now, revokedAt: now },
      });
    }
    return !already;
  }
}
