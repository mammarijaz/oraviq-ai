import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MessageDirection, MessageType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PaginatedResponseDto } from '../../common/dto/pagination.dto';
import { CreateMessageDto, AttachmentDto } from './dto/create-message.dto';
import { MessageQueryDto } from './dto/message-query.dto';

@Injectable()
export class MessagesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Verify conversation belongs to org, throw if not found */
  private async verifyConversation(orgId: string, conversationId: string) {
    const conversation = await this.prisma.conversation.findFirst({
      where: { id: conversationId, organizationId: orgId },
    });
    if (!conversation) {
      throw new NotFoundException(`Conversation ${conversationId} not found`);
    }
    return conversation;
  }

  async findByConversation(
    orgId: string,
    conversationId: string,
    query: MessageQueryDto,
  ) {
    await this.verifyConversation(orgId, conversationId);

    const { page = 1, limit = 50, type, direction } = query;
    const skip = (page - 1) * limit;

    const where: any = { conversationId };
    if (type) where.type = type;
    if (direction) where.direction = direction;

    const [data, total] = await this.prisma.$transaction([
      this.prisma.message.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'asc' },
        include: {
          sender: {
            select: { id: true, name: true, email: true, avatar: true },
          },
          attachments: true,
        },
      }),
      this.prisma.message.count({ where }),
    ]);

    return new PaginatedResponseDto(data, total, query);
  }

  async create(
    orgId: string,
    conversationId: string,
    dto: CreateMessageDto,
    senderId: string,
  ) {
    await this.verifyConversation(orgId, conversationId);

    const message = await this.prisma.message.create({
      data: {
        conversationId,
        senderId,
        direction: dto.direction ?? MessageDirection.OUTBOUND,
        type: dto.type ?? MessageType.TEXT,
        content: dto.content,
        ...(dto.attachments && dto.attachments.length > 0
          ? {
              attachments: {
                create: dto.attachments.map((a) => ({
                  type: a.type,
                  url: a.url,
                  name: a.name,
                  size: a.size,
                })),
              },
            }
          : {}),
      },
      include: {
        sender: {
          select: { id: true, name: true, email: true, avatar: true },
        },
        attachments: true,
      },
    });

    // Update conversation's lastMessageAt
    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { lastMessageAt: message.createdAt },
    });

    return message;
  }

  async createSystemMessage(conversationId: string, content: string) {
    const message = await this.prisma.message.create({
      data: {
        conversationId,
        senderId: null,
        direction: MessageDirection.OUTBOUND,
        type: MessageType.SYSTEM,
        content,
      },
      include: { attachments: true },
    });

    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { lastMessageAt: message.createdAt },
    });

    return message;
  }

  async createAiMessage(conversationId: string, content: string) {
    const message = await this.prisma.message.create({
      data: {
        conversationId,
        senderId: null,
        direction: MessageDirection.OUTBOUND,
        type: MessageType.AI,
        content,
      },
      include: { attachments: true },
    });

    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { lastMessageAt: message.createdAt },
    });

    return message;
  }

  async addAttachment(orgId: string, conversationId: string, messageId: string, dto: AttachmentDto) {
    // Verify conversation belongs to org
    await this.verifyConversation(orgId, conversationId);

    const message = await this.prisma.message.findFirst({
      where: { id: messageId, conversationId },
    });
    if (!message) {
      throw new NotFoundException(`Message ${messageId} not found in conversation ${conversationId}`);
    }

    return this.prisma.messageAttachment.create({
      data: {
        messageId,
        type: dto.type,
        url: dto.url,
        name: dto.name,
        size: dto.size,
      },
    });
  }

  // ── Internal notes ──────────────────────────────────────────────────────────

  async createNote(
    orgId: string,
    conversationId: string,
    authorId: string,
    content: string,
  ) {
    await this.verifyConversation(orgId, conversationId);

    return this.prisma.internalNote.create({
      data: {
        conversationId,
        authorId,
        content,
      },
      include: {
        author: {
          select: { id: true, name: true, email: true, avatar: true },
        },
      },
    });
  }

  async findNotes(orgId: string, conversationId: string) {
    await this.verifyConversation(orgId, conversationId);

    return this.prisma.internalNote.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
      include: {
        author: {
          select: { id: true, name: true, email: true, avatar: true },
        },
      },
    });
  }
}
