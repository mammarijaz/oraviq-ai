import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { MessageDirection, MessageType } from '@prisma/client';
import { MessagesService } from '../messages.service';
import { PrismaService } from '../../../prisma/prisma.service';

describe('MessagesService', () => {
  let service: MessagesService;
  let prisma: jest.Mocked<any>;

  const orgId = 'org-1';
  const conversationId = 'conv-1';
  const senderId = 'user-1';

  const mockConversation = {
    id: conversationId,
    organizationId: orgId,
    contactId: 'contact-1',
    channel: 'WHATSAPP',
    status: 'OPEN',
  };

  const mockMessage = {
    id: 'msg-1',
    conversationId,
    senderId,
    direction: MessageDirection.OUTBOUND,
    type: MessageType.TEXT,
    content: 'Hello there',
    createdAt: new Date(),
    sender: { id: senderId, name: 'Agent', email: 'agent@example.com', avatar: null },
    attachments: [],
  };

  beforeEach(async () => {
    prisma = {
      conversation: {
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      message: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        count: jest.fn(),
      },
      internalNote: {
        findMany: jest.fn(),
        create: jest.fn(),
      },
      messageAttachment: {
        create: jest.fn(),
      },
      $transaction: jest.fn((arr) => Promise.all(arr)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MessagesService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<MessagesService>(MessagesService);
  });

  describe('findByConversation()', () => {
    it('returns paginated messages', async () => {
      prisma.conversation.findFirst.mockResolvedValue(mockConversation);
      prisma.message.findMany.mockResolvedValue([mockMessage]);
      prisma.message.count.mockResolvedValue(1);

      const result = await service.findByConversation(orgId, conversationId, {
        page: 1,
        limit: 50,
      } as any);

      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
    });

    it('throws NotFoundException when conversation not found', async () => {
      prisma.conversation.findFirst.mockResolvedValue(null);

      await expect(
        service.findByConversation(orgId, 'nonexistent', { page: 1, limit: 50 } as any),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('create()', () => {
    it('creates message and updates conversation lastMessageAt', async () => {
      prisma.conversation.findFirst.mockResolvedValue(mockConversation);
      prisma.message.create.mockResolvedValue(mockMessage);
      prisma.conversation.update.mockResolvedValue({});

      const result = await service.create(
        orgId,
        conversationId,
        { content: 'Hello there', direction: MessageDirection.OUTBOUND },
        senderId,
      );

      expect(prisma.message.create).toHaveBeenCalled();
      expect(prisma.conversation.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: conversationId },
          data: { lastMessageAt: mockMessage.createdAt },
        }),
      );
      expect(result.content).toBe('Hello there');
    });

    it('creates message with default type TEXT and direction OUTBOUND', async () => {
      prisma.conversation.findFirst.mockResolvedValue(mockConversation);
      prisma.message.create.mockResolvedValue(mockMessage);
      prisma.conversation.update.mockResolvedValue({});

      await service.create(orgId, conversationId, { content: 'Hi' }, senderId);

      expect(prisma.message.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: MessageType.TEXT,
            direction: MessageDirection.OUTBOUND,
          }),
        }),
      );
    });
  });

  describe('createSystemMessage()', () => {
    it('creates SYSTEM type message', async () => {
      const systemMsg = {
        ...mockMessage,
        senderId: null,
        type: MessageType.SYSTEM,
        content: 'Conversation opened',
      };
      prisma.message.create.mockResolvedValue(systemMsg);
      prisma.conversation.update.mockResolvedValue({});

      const result = await service.createSystemMessage(conversationId, 'Conversation opened');

      expect(prisma.message.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            conversationId,
            senderId: null,
            type: MessageType.SYSTEM,
            content: 'Conversation opened',
          }),
        }),
      );
      expect(result.type).toBe(MessageType.SYSTEM);
    });
  });

  describe('createAiMessage()', () => {
    it('creates AI type message', async () => {
      const aiMsg = {
        ...mockMessage,
        senderId: null,
        type: MessageType.AI,
        content: 'AI response',
      };
      prisma.message.create.mockResolvedValue(aiMsg);
      prisma.conversation.update.mockResolvedValue({});

      const result = await service.createAiMessage(conversationId, 'AI response');

      expect(prisma.message.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: MessageType.AI,
            senderId: null,
          }),
        }),
      );
      expect(result.type).toBe(MessageType.AI);
    });

    it('updates conversation lastMessageAt after AI message', async () => {
      const aiMsg = { ...mockMessage, type: MessageType.AI };
      prisma.message.create.mockResolvedValue(aiMsg);
      prisma.conversation.update.mockResolvedValue({});

      await service.createAiMessage(conversationId, 'AI reply');

      expect(prisma.conversation.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: conversationId },
          data: { lastMessageAt: aiMsg.createdAt },
        }),
      );
    });
  });

  describe('createNote()', () => {
    it('creates internal note', async () => {
      const mockNote = {
        id: 'note-1',
        conversationId,
        authorId: senderId,
        content: 'This is a note',
        createdAt: new Date(),
        author: { id: senderId, name: 'Agent', email: 'agent@example.com', avatar: null },
      };
      prisma.conversation.findFirst.mockResolvedValue(mockConversation);
      prisma.internalNote.create.mockResolvedValue(mockNote);

      const result = await service.createNote(orgId, conversationId, senderId, 'This is a note');

      expect(prisma.internalNote.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            conversationId,
            authorId: senderId,
            content: 'This is a note',
          }),
        }),
      );
      expect(result.content).toBe('This is a note');
    });
  });

  describe('findNotes()', () => {
    it('returns notes for conversation', async () => {
      const mockNotes = [
        {
          id: 'note-1',
          conversationId,
          authorId: senderId,
          content: 'Note 1',
          createdAt: new Date(),
          author: { id: senderId, name: 'Agent', email: 'agent@example.com', avatar: null },
        },
      ];
      prisma.conversation.findFirst.mockResolvedValue(mockConversation);
      prisma.internalNote.findMany.mockResolvedValue(mockNotes);

      const result = await service.findNotes(orgId, conversationId);

      expect(result).toHaveLength(1);
      expect(result[0].content).toBe('Note 1');
      expect(prisma.internalNote.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { conversationId },
        }),
      );
    });

    it('throws NotFoundException when conversation not found', async () => {
      prisma.conversation.findFirst.mockResolvedValue(null);

      await expect(service.findNotes(orgId, 'nonexistent')).rejects.toThrow(NotFoundException);
    });
  });
});
