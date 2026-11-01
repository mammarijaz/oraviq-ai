import { BadRequestException, Injectable } from '@nestjs/common';
import type { SimulatorInboundRequest, SimulatorInboundResponse } from '@oraviq/shared';
import { normalizePhone } from '../../common/phone';
import { DbService } from '../../prisma/db.service';
import { InboundService } from '../inbox/inbound.service';
import { toMessageDto } from '../inbox/mappers';

export const SIM_PHONE = '+14045550199';

/** "Try it out": runs the real inbound pipeline through the mock provider. */
@Injectable()
export class SimulatorService {
  constructor(
    private readonly dbs: DbService,
    private readonly pipeline: InboundService,
  ) {}

  async inbound(body: Partial<SimulatorInboundRequest>): Promise<SimulatorInboundResponse> {
    const channel = body.channel ?? 'sms';
    if (!['sms', 'facebook', 'instagram', 'web_chat'].includes(channel)) throw new BadRequestException('channel must be sms, facebook, instagram or web_chat.');
    const text = String(body.body ?? '').trim();
    if (!text) throw new BadRequestException('Type a message.');
    let from: string;
    let name: string | null = body.name?.trim() || null;
    if (channel === 'sms') {
      const p = normalizePhone(body.from ?? SIM_PHONE);
      if (!p) throw new BadRequestException('from must be a phone number.');
      from = p;
    } else {
      from = body.from?.trim() || `sim_${channel}_${this.dbs.tenantId.slice(0, 8)}`;
    }
    if (body.newConversation) {
      await this.dbs.db.conversation.updateMany({ where: { simulated: true, channel: channel === 'sms' ? { in: ['sms', 'phone', 'booking_form'] } : (channel as any), contact: { identities: { some: { addressNormalized: from } } }, state: { not: 'closed' } }, data: { state: 'closed', tag: 'Closed' } });
    }
    const res = await this.pipeline.handle(this.dbs.tenantId, {
      provider: 'mock',
      channel: channel as any,
      from,
      fromName: name,
      body: text,
      simulated: true,
      externalThreadId: channel === 'web_chat' ? from : null,
    });
    return { conversationId: res.conversationId, replies: res.replies.map(toMessageDto) };
  }

  async missedCall(body: { from?: string }): Promise<{ conversationId: string }> {
    const p = normalizePhone(body.from ?? SIM_PHONE);
    if (!p) throw new BadRequestException('from must be a phone number.');
    await this.dbs.db.conversation.updateMany({ where: { simulated: true, channel: { in: ['sms', 'phone', 'booking_form'] }, contact: { identities: { some: { addressNormalized: p } } }, state: { not: 'closed' } }, data: { state: 'closed', tag: 'Closed' } });
    return this.pipeline.missedCall(this.dbs.tenantId, { from: p, simulated: true });
  }
}
