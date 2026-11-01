import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConversationStatus, MessageDirection, MessageType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PaginatedResponseDto } from '../../common/dto/pagination.dto';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { UpdateConversationDto } from './dto/update-conversation.dto';
import { ConversationQueryDto } from './dto/conversation-query.dto';

@Injectable()
export class ConversationsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(orgId: string, query: ConversationQueryDto) {
    const { page = 1, limit = 25, status, channel, assigneeId, search } = query;
    const skip = (page - 1) * limit;

    const where: any = { organizationId: orgId };

    if (status) where.status = status;
    if (channel) where.channel = channel;
    if (assigneeId !== undefined) {
      where.assigneeId = assigneeId || null;
    }

    if (search) {
      where.OR = [
        { subject: { contains: search, mode: 'insensitive' } },
        { contact: { name: { contains: search, mode: 'insensitive' } } },
        { contact: { email: { contains: search, mode: 'insensitive' } } },
      ];
    }

    const [data, total] = await this.prisma.$transaction([
      this.prisma.conversation.findMany({
        where,
        skip,
        take: limit,
        orderBy: { lastMessageAt: 'desc' },
        include: {
          contact: true,
          assignee: {
            select: { id: true, name: true, email: true, avatar: true },
          },
          conversationTags: { include: { tag: true } },
          messages: {
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
      }),
      this.prisma.conversation.count({ where }),
    ]);

    return new PaginatedResponseDto(data, total, query);
  }

  async findOne(orgId: string, conversationId: string) {
    const conversation = await this.prisma.conversation.findFirst({
      where: { id: conversationId, organizationId: orgId },
      include: {
        contact: {
          include: { contactTags: { include: { tag: true } } },
        },
        assignee: {
          select: { id: true, name: true, email: true, avatar: true, role: true },
        },
        conversationTags: { include: { tag: true } },
        _count: { select: { messages: true, internalNotes: true } },
      },
    });

    if (!conversation) {
      throw new NotFoundException(`Conversation ${conversationId} not found`);
    }

    return conversation;
  }

  async create(orgId: string, dto: CreateConversationDto, creatorId?: string) {
    // Verify contact belongs to org
    const contact = await this.prisma.contact.findFirst({
      where: { id: dto.contactId, organizationId: orgId },
    });
    if (!contact) {
      throw new NotFoundException(`Contact ${dto.contactId} not found`);
    }

    const conversation = await this.prisma.conversation.create({
      data: {
        organizationId: orgId,
        contactId: dto.contactId,
        channel: dto.channel,
        subject: dto.subject,
        lastMessageAt: dto.initialMessage ? new Date() : undefined,
      },
      include: {
        contact: true,
        assignee: {
          select: { id: true, name: true, email: true, avatar: true },
        },
        conversationTags: { include: { tag: true } },
      },
    });

    if (dto.initialMessage) {
      await this.prisma.message.create({
        data: {
          conversationId: conversation.id,
          senderId: creatorId ?? null,
          direction: MessageDirection.OUTBOUND,
          type: MessageType.TEXT,
          content: dto.initialMessage,
        },
      });
    }

    return conversation;
  }

  async updateStatus(
    orgId: string,
    conversationId: string,
    status: ConversationStatus,
  ) {
    await this.findOne(orgId, conversationId);

    return this.prisma.conversation.update({
      where: { id: conversationId },
      data: {
        status,
        closedAt:
          status === ConversationStatus.RESOLVED ? new Date() : undefined,
      },
      include: {
        contact: true,
        assignee: {
          select: { id: true, name: true, email: true, avatar: true },
        },
        conversationTags: { include: { tag: true } },
      },
    });
  }

  async update(orgId: string, conversationId: string, dto: UpdateConversationDto) {
    await this.findOne(orgId, conversationId);

    const data: Record<string, unknown> = {};
    if (dto.status !== undefined) {
      data.status = dto.status;
      if (dto.status === ConversationStatus.RESOLVED) {
        data.closedAt = new Date();
      }
    }
    if (dto.assigneeId !== undefined) data.assigneeId = dto.assigneeId;
    if (dto.subject !== undefined) data.subject = dto.subject;

    return this.prisma.conversation.update({
      where: { id: conversationId },
      data,
      include: {
        contact: true,
        assignee: {
          select: { id: true, name: true, email: true, avatar: true },
        },
        conversationTags: { include: { tag: true } },
      },
    });
  }

  async assign(orgId: string, conversationId: string, assigneeId: string) {
    await this.findOne(orgId, conversationId);

    // Verify assignee belongs to org
    const user = await this.prisma.user.findFirst({
      where: { id: assigneeId, organizationId: orgId },
    });
    if (!user) {
      throw new NotFoundException(`User ${assigneeId} not found`);
    }

    return this.prisma.conversation.update({
      where: { id: conversationId },
      data: { assigneeId },
      include: {
        contact: true,
        assignee: {
          select: { id: true, name: true, email: true, avatar: true },
        },
        conversationTags: { include: { tag: true } },
      },
    });
  }

  async unassign(orgId: string, conversationId: string) {
    await this.findOne(orgId, conversationId);

    return this.prisma.conversation.update({
      where: { id: conversationId },
      data: { assigneeId: null },
      include: {
        contact: true,
        assignee: {
          select: { id: true, name: true, email: true, avatar: true },
        },
        conversationTags: { include: { tag: true } },
      },
    });
  }

  async addTag(orgId: string, conversationId: string, tagId: string) {
    await this.findOne(orgId, conversationId);

    const tag = await this.prisma.tag.findFirst({
      where: { id: tagId, organizationId: orgId },
    });
    if (!tag) {
      throw new NotFoundException(`Tag ${tagId} not found`);
    }

    await this.prisma.conversationTag.upsert({
      where: { conversationId_tagId: { conversationId, tagId } },
      update: {},
      create: { conversationId, tagId },
    });

    return this.findOne(orgId, conversationId);
  }

  async removeTag(orgId: string, conversationId: string, tagId: string) {
    await this.findOne(orgId, conversationId);

    await this.prisma.conversationTag.deleteMany({
      where: { conversationId, tagId },
    });
  }

  async getUnreadCount(orgId: string): Promise<{ count: number }> {
    const count = await this.prisma.conversation.count({
      where: {
        organizationId: orgId,
        status: ConversationStatus.OPEN,
      },
    });
    return { count };
  }
}
