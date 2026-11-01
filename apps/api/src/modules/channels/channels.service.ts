import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ChannelType } from '@prisma/client';

@Injectable()
export class ChannelsService {
  constructor(private readonly prisma: PrismaService) {}

  getConnectedChannels(orgId: string) {
    return this.prisma.channelAccount.findMany({
      where: { organizationId: orgId },
      orderBy: { createdAt: 'asc' },
    });
  }

  connectChannel(
    orgId: string,
    type: string,
    name: string,
    credentials: Record<string, unknown>,
    config?: Record<string, unknown>,
  ) {
    const channel = this.toChannelType(type);
    return this.prisma.channelAccount.create({
      data: {
        organizationId: orgId,
        channel,
        name,
        credentials: credentials as object,
        config: (config as object) ?? undefined,
        status: 'CONNECTED',
      },
    });
  }

  async disconnectChannel(orgId: string, type: string) {
    const channel = this.toChannelType(type);
    const account = await this.prisma.channelAccount.findFirst({
      where: { organizationId: orgId, channel },
    });
    if (!account) throw new NotFoundException(`Channel ${type} not connected`);
    return this.prisma.channelAccount.update({
      where: { id: account.id },
      data: { status: 'DISCONNECTED' },
    });
  }

  async updateConfig(
    orgId: string,
    type: string,
    config: Record<string, unknown>,
  ) {
    const channel = this.toChannelType(type);
    const account = await this.prisma.channelAccount.findFirst({
      where: { organizationId: orgId, channel },
    });
    if (!account) throw new NotFoundException(`Channel ${type} not found`);
    return this.prisma.channelAccount.update({
      where: { id: account.id },
      data: { config: config as object },
    });
  }

  private toChannelType(type: string): ChannelType {
    const map: Record<string, ChannelType> = {
      whatsapp: 'WHATSAPP',
      instagram: 'INSTAGRAM',
      sms: 'SMS',
      livechat: 'LIVECHAT',
      voice: 'VOICE',
      email: 'EMAIL',
    };
    const channelType = map[type.toLowerCase()];
    if (!channelType) {
      throw new BadRequestException(`Unknown channel type: ${type}`);
    }
    return channelType;
  }
}
