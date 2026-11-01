import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { TagsService } from '../tags.service';
import { PrismaService } from '../../../prisma/prisma.service';

describe('TagsService', () => {
  let service: TagsService;
  let prisma: jest.Mocked<any>;

  const orgId = 'org-1';
  const tagId = 'tag-1';

  const mockTag = {
    id: tagId,
    organizationId: orgId,
    name: 'VIP',
    color: '#FF0000',
    createdAt: new Date(),
  };

  beforeEach(async () => {
    prisma = {
      tag: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TagsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<TagsService>(TagsService);
  });

  describe('findAll()', () => {
    it('returns tags for org', async () => {
      const tags = [mockTag, { ...mockTag, id: 'tag-2', name: 'Lead' }];
      prisma.tag.findMany.mockResolvedValue(tags);

      const result = await service.findAll(orgId);

      expect(result).toHaveLength(2);
      expect(prisma.tag.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { organizationId: orgId },
        }),
      );
    });

    it('returns empty array when no tags', async () => {
      prisma.tag.findMany.mockResolvedValue([]);

      const result = await service.findAll(orgId);

      expect(result).toEqual([]);
    });
  });

  describe('create()', () => {
    it('creates tag', async () => {
      prisma.tag.findUnique.mockResolvedValue(null);
      prisma.tag.create.mockResolvedValue(mockTag);

      const result = await service.create(orgId, { name: 'VIP', color: '#FF0000' });

      expect(prisma.tag.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            organizationId: orgId,
            name: 'VIP',
            color: '#FF0000',
          }),
        }),
      );
      expect(result.name).toBe('VIP');
    });

    it('uses default color when not provided', async () => {
      prisma.tag.findUnique.mockResolvedValue(null);
      prisma.tag.create.mockResolvedValue({ ...mockTag, color: '#6B7280' });

      await service.create(orgId, { name: 'VIP' });

      expect(prisma.tag.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ color: '#6B7280' }),
        }),
      );
    });

    it('throws ConflictException for duplicate name', async () => {
      prisma.tag.findUnique.mockResolvedValue(mockTag);

      await expect(service.create(orgId, { name: 'VIP' })).rejects.toThrow(ConflictException);
    });
  });

  describe('remove()', () => {
    it('deletes tag', async () => {
      prisma.tag.findFirst.mockResolvedValue(mockTag);
      prisma.tag.delete.mockResolvedValue(mockTag);

      await service.remove(orgId, tagId);

      expect(prisma.tag.delete).toHaveBeenCalledWith({ where: { id: tagId } });
    });

    it('throws NotFoundException when tag not found', async () => {
      prisma.tag.findFirst.mockResolvedValue(null);

      await expect(service.remove(orgId, 'nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update()', () => {
    it('updates tag fields', async () => {
      const updated = { ...mockTag, color: '#00FF00' };
      prisma.tag.findFirst.mockResolvedValue(mockTag);
      prisma.tag.update.mockResolvedValue(updated);

      const result = await service.update(orgId, tagId, { color: '#00FF00' });

      expect(prisma.tag.update).toHaveBeenCalledWith({
        where: { id: tagId },
        data: { color: '#00FF00' },
      });
      expect(result.color).toBe('#00FF00');
    });

    it('throws NotFoundException when tag does not exist', async () => {
      prisma.tag.findFirst.mockResolvedValue(null);

      await expect(service.update(orgId, 'nonexistent', { name: 'X' }))
        .rejects.toThrow(NotFoundException);
    });
  });
});
