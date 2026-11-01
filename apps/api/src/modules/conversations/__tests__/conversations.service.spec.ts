import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ConversationStatus } from '@prisma/client';
import { ConversationsService } from '../conversations.service';
import { PrismaService } from '../../../prisma/prisma.service';

describe('ConversationsService', () => {
  let service: ConversationsService;
  let prisma: jest.Mocked<any>;

  const orgId = 'org-1';
  const conversationId = 'conv-1';
  const userId = 'user-1';

  const mockConversation = {
    id: conversationId,
    organizationId: orgId,
    contactId: 'contact-1',
    channel: 'WHATSAPP',
    status: ConversationStatus.OPEN,
    assigneeId: null,
    subject: 'Test conversation',
    lastMessageAt: null,
    closedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    contact: { id: 'contact-1', name: 'John Doe' },
    assignee: null,
    conversationTags: [],
    _count: { messages: 0, internalNotes: 0 },
  };

  const mockContact = {
    id: 'contact-1',
    organizationId: orgId,
    name: 'John Doe',
  };

  beforeEach(async () => {
    prisma = {
      conversation: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        count: jest.fn(),
      },
      contact: {
        findFirst: jest.fn(),
      },
      user: {
        findFirst: jest.fn(),
      },
      message: {
        create: jest.fn(),
      },
      tag: {
        findFirst: jest.fn(),
      },
      conversationTag: {
        upsert: jest.fn(),
        deleteMany: jest.fn(),
      },
      $transaction: jest.fn((arr) => Promise.all(arr)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConversationsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<ConversationsService>(ConversationsService);
  });

  describe('findAll()', () => {
    it('returns paginated conversations', async () => {
      prisma.conversation.findMany.mockResolvedValue([mockConversation]);
      prisma.conversation.count.mockResolvedValue(1);

      const result = await service.findAll(orgId, { page: 1, limit: 25 } as any);

      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
    });

    it('filters by status when provided', async () => {
      prisma.conversation.findMany.mockResolvedValue([mockConversation]);
      prisma.conversation.count.mockResolvedValue(1);

      await service.findAll(orgId, { page: 1, limit: 25, status: ConversationStatus.OPEN } as any);

      expect(prisma.$transaction).toHaveBeenCalled();
    });
  });

  describe('findOne()', () => {
    it('returns conversation with relations', async () => {
      prisma.conversation.findFirst.mockResolvedValue(mockConversation);

      const result = await service.findOne(orgId, conversationId);

      expect(result).toEqual(mockConversation);
      expect(prisma.conversation.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: conversationId, organizationId: orgId },
        }),
      );
    });

    it('throws NotFoundException for invalid id', async () => {
      prisma.conversation.findFirst.mockResolvedValue(null);

      await expect(service.findOne(orgId, 'nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('create()', () => {
    it('creates conversation', async () => {
      prisma.contact.findFirst.mockResolvedValue(mockContact);
      prisma.conversation.create.mockResolvedValue(mockConversation);

      const result = await service.create(
        orgId,
        { contactId: 'contact-1', channel: 'WHATSAPP' as any },
        userId,
      );

      expect(prisma.conversation.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            organizationId: orgId,
            contactId: 'contact-1',
          }),
        }),
      );
      expect(result.id).toBe(conversationId);
    });

    it('creates initial message when provided', async () => {
      prisma.contact.findFirst.mockResolvedValue(mockContact);
      prisma.conversation.create.mockResolvedValue(mockConversation);
      prisma.message.create.mockResolvedValue({ id: 'msg-1', content: 'Hello' });

      await service.create(
        orgId,
        { contactId: 'contact-1', channel: 'WHATSAPP' as any, initialMessage: 'Hello' },
        userId,
      );

      expect(prisma.message.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ content: 'Hello' }),
        }),
      );
    });

    it('throws NotFoundException when contact not found', async () => {
      prisma.contact.findFirst.mockResolvedValue(null);

      await expect(
        service.create(orgId, { contactId: 'nonexistent', channel: 'WHATSAPP' as any }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateStatus()', () => {
    it('changes status', async () => {
      prisma.conversation.findFirst.mockResolvedValue(mockConversation);
      prisma.conversation.update.mockResolvedValue({
        ...mockConversation,
        status: ConversationStatus.RESOLVED,
      });

      const result = await service.updateStatus(orgId, conversationId, ConversationStatus.RESOLVED);

      expect(prisma.conversation.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: conversationId },
          data: expect.objectContaining({ status: ConversationStatus.RESOLVED }),
        }),
      );
      expect(result.status).toBe(ConversationStatus.RESOLVED);
    });
  });

  describe('assign()', () => {
    it('sets assignee', async () => {
      const mockUser = { id: userId, organizationId: orgId, name: 'Agent' };
      prisma.conversation.findFirst.mockResolvedValue(mockConversation);
      prisma.user.findFirst.mockResolvedValue(mockUser);
      prisma.conversation.update.mockResolvedValue({
        ...mockConversation,
        assigneeId: userId,
      });

      const result = await service.assign(orgId, conversationId, userId);

      expect(prisma.conversation.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { assigneeId: userId },
        }),
      );
      expect(result.assigneeId).toBe(userId);
    });

    it('throws NotFoundException when assignee not in org', async () => {
      prisma.conversation.findFirst.mockResolvedValue(mockConversation);
      prisma.user.findFirst.mockResolvedValue(null);

      await expect(service.assign(orgId, conversationId, 'unknown-user'))
        .rejects.toThrow(NotFoundException);
    });
  });

  describe('unassign()', () => {
    it('removes assignee', async () => {
      prisma.conversation.findFirst.mockResolvedValue({
        ...mockConversation,
        assigneeId: userId,
      });
      prisma.conversation.update.mockResolvedValue({
        ...mockConversation,
        assigneeId: null,
      });

      const result = await service.unassign(orgId, conversationId);

      expect(prisma.conversation.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { assigneeId: null },
        }),
      );
      expect(result.assigneeId).toBeNull();
    });
  });

  describe('getUnreadCount()', () => {
    it('returns count of open conversations', async () => {
      prisma.conversation.count.mockResolvedValue(7);

      const result = await service.getUnreadCount(orgId);

      expect(result).toEqual({ count: 7 });
      expect(prisma.conversation.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: orgId,
            status: ConversationStatus.OPEN,
          }),
        }),
      );
    });
  });
});
