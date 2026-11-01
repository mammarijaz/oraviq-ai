import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ContactsService } from '../contacts.service';
import { PrismaService } from '../../../prisma/prisma.service';

describe('ContactsService', () => {
  let service: ContactsService;
  let prisma: jest.Mocked<any>;

  const orgId = 'org-1';
  const contactId = 'contact-1';
  const tagId = 'tag-1';

  const mockContact = {
    id: contactId,
    organizationId: orgId,
    name: 'John Doe',
    email: 'john@example.com',
    phone: '+1234567890',
    channel: 'WHATSAPP',
    metadata: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    contactTags: [],
    _count: { conversations: 0 },
  };

  beforeEach(async () => {
    prisma = {
      contact: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        delete: jest.fn(),
        count: jest.fn(),
      },
      tag: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
      },
      contactTag: {
        upsert: jest.fn(),
        deleteMany: jest.fn(),
      },
      conversation: {
        updateMany: jest.fn(),
      },
      $transaction: jest.fn((arr) => Promise.all(arr)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContactsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<ContactsService>(ContactsService);
  });

  describe('findAll()', () => {
    it('returns paginated contacts scoped to orgId', async () => {
      prisma.contact.findMany.mockResolvedValue([mockContact]);
      prisma.contact.count.mockResolvedValue(1);

      const result = await service.findAll(orgId, { page: 1, limit: 25 } as any);

      expect(result.data).toHaveLength(1);
      expect(result.data[0].organizationId).toBe(orgId);
      expect(result.meta.total).toBe(1);
      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('returns correct pagination metadata', async () => {
      prisma.contact.findMany.mockResolvedValue([mockContact]);
      prisma.contact.count.mockResolvedValue(50);

      const result = await service.findAll(orgId, { page: 2, limit: 25 } as any);

      expect(result.meta.page).toBe(2);
      expect(result.meta.limit).toBe(25);
      expect(result.meta.total).toBe(50);
      expect(result.meta.totalPages).toBe(2);
    });
  });

  describe('findOne()', () => {
    it('returns single contact', async () => {
      prisma.contact.findFirst.mockResolvedValue(mockContact);

      const result = await service.findOne(orgId, contactId);

      expect(result).toEqual(mockContact);
      expect(prisma.contact.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: contactId, organizationId: orgId },
        }),
      );
    });

    it('throws NotFoundException for invalid id', async () => {
      prisma.contact.findFirst.mockResolvedValue(null);

      await expect(service.findOne(orgId, 'nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('create()', () => {
    it('creates contact with orgId', async () => {
      const dto = {
        name: 'Jane Doe',
        email: 'jane@example.com',
        phone: '+0987654321',
        channel: 'SMS' as any,
      };
      prisma.contact.create.mockResolvedValue({ ...mockContact, ...dto });

      const result = await service.create(orgId, dto as any);

      expect(prisma.contact.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ organizationId: orgId }),
        }),
      );
      expect(result.name).toBe(dto.name);
    });
  });

  describe('update()', () => {
    it('updates contact fields', async () => {
      const dto = { name: 'Updated Name', email: 'updated@example.com' };
      const updatedContact = { ...mockContact, ...dto };
      prisma.contact.findFirst.mockResolvedValue(mockContact);
      prisma.contact.update.mockResolvedValue(updatedContact);

      const result = await service.update(orgId, contactId, dto as any);

      expect(prisma.contact.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: contactId },
          data: expect.objectContaining({ name: dto.name }),
        }),
      );
      expect(result.name).toBe('Updated Name');
    });

    it('throws NotFoundException when contact does not exist', async () => {
      prisma.contact.findFirst.mockResolvedValue(null);

      await expect(service.update(orgId, 'nonexistent', { name: 'X' } as any))
        .rejects.toThrow(NotFoundException);
    });
  });

  describe('remove()', () => {
    it('deletes contact', async () => {
      prisma.contact.findFirst.mockResolvedValue(mockContact);
      prisma.contact.delete.mockResolvedValue(mockContact);

      await service.remove(orgId, contactId);

      expect(prisma.contact.delete).toHaveBeenCalledWith({ where: { id: contactId } });
    });
  });

  describe('addTag()', () => {
    it('creates contact-tag relation', async () => {
      prisma.contact.findFirst.mockResolvedValue(mockContact);
      prisma.tag.findFirst.mockResolvedValue({ id: tagId, organizationId: orgId, name: 'VIP' });
      prisma.contactTag.upsert.mockResolvedValue({});
      // Second findFirst call for the return value
      prisma.contact.findFirst.mockResolvedValueOnce(mockContact).mockResolvedValueOnce(mockContact);

      await service.addTag(orgId, contactId, tagId);

      expect(prisma.contactTag.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { contactId_tagId: { contactId, tagId } },
          create: { contactId, tagId },
        }),
      );
    });

    it('throws NotFoundException when tag does not exist', async () => {
      prisma.contact.findFirst.mockResolvedValue(mockContact);
      prisma.tag.findFirst.mockResolvedValue(null);

      await expect(service.addTag(orgId, contactId, 'nonexistent-tag'))
        .rejects.toThrow(NotFoundException);
    });
  });

  describe('removeTag()', () => {
    it('deletes contact-tag relation', async () => {
      prisma.contact.findFirst.mockResolvedValue(mockContact);
      prisma.contactTag.deleteMany.mockResolvedValue({ count: 1 });

      await service.removeTag(orgId, contactId, tagId);

      expect(prisma.contactTag.deleteMany).toHaveBeenCalledWith({
        where: { contactId, tagId },
      });
    });
  });
});
