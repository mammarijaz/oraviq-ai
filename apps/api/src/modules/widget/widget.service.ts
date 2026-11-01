import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { InitSessionDto } from './dto/init-session.dto';

interface WidgetTokenPayload {
  contactId: string;
  conversationId: string;
  orgId: string;
}

@Injectable()
export class WidgetService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async initSession(dto: InitSessionDto) {
    const { orgId, name, email, metadata } = dto;

    // Verify org exists
    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
      select: { id: true, name: true },
    });
    if (!org) throw new NotFoundException('Organisation not found');

    // Create or reuse contact
    let contact = email
      ? await this.prisma.contact.findFirst({
          where: { organizationId: orgId, email },
        })
      : null;

    if (!contact) {
      contact = await this.prisma.contact.create({
        data: {
          organizationId: orgId,
          name: name ?? 'Visitor',
          email,
          channel: 'LIVECHAT',
          metadata: metadata as object,
        },
      });
    }

    // Create new conversation
    const conversation = await this.prisma.conversation.create({
      data: {
        organizationId: orgId,
        contactId: contact.id,
        channel: 'LIVECHAT',
        status: 'OPEN',
      },
    });

    // Issue a widget JWT (no expiry for simplicity; add exp in production)
    const sessionToken = this.jwtService.sign({
      contactId: contact.id,
      conversationId: conversation.id,
      orgId,
    } satisfies WidgetTokenPayload);

    return {
      sessionToken,
      conversationId: conversation.id,
      orgConfig: {
        orgId: org.id,
        orgName: org.name,
      },
    };
  }

  async sendMessage(sessionToken: string, content: string) {
    const payload = this.verifyToken(sessionToken);

    // Verify conversation still exists and belongs to the claimed org
    const conversation = await this.prisma.conversation.findFirst({
      where: { id: payload.conversationId, organizationId: payload.orgId },
    });
    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    const message = await this.prisma.message.create({
      data: {
        conversationId: payload.conversationId,
        direction: 'INBOUND',
        type: 'TEXT',
        content,
      },
    });

    // Update conversation's lastMessageAt
    await this.prisma.conversation.update({
      where: { id: payload.conversationId },
      data: { lastMessageAt: message.createdAt },
    });

    return message;
  }

  async getMessages(sessionToken: string) {
    const payload = this.verifyToken(sessionToken);

    return this.prisma.message.findMany({
      where: { conversationId: payload.conversationId },
      orderBy: { createdAt: 'asc' },
    });
  }

  private verifyToken(token: string): WidgetTokenPayload {
    try {
      return this.jwtService.verify<WidgetTokenPayload>(token);
    } catch {
      throw new UnauthorizedException('Invalid or expired widget session token');
    }
  }
}
