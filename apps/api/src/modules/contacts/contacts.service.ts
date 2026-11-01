import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PaginatedResponseDto } from '../../common/dto/pagination.dto';
import { CreateContactDto } from './dto/create-contact.dto';
import { UpdateContactDto } from './dto/update-contact.dto';
import { ContactQueryDto } from './dto/contact-query.dto';

@Injectable()
export class ContactsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(orgId: string, query: ContactQueryDto) {
    const { page = 1, limit = 25, search, channel, tagIds } = query;
    const skip = (page - 1) * limit;

    const where: any = { organizationId: orgId };

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (channel) {
      where.channel = channel;
    }

    if (tagIds && tagIds.length > 0) {
      where.contactTags = {
        some: {
          tagId: { in: tagIds },
        },
      };
    }

    const [data, total] = await this.prisma.$transaction([
      this.prisma.contact.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          contactTags: {
            include: { tag: true },
          },
          _count: { select: { conversations: true } },
        },
      }),
      this.prisma.contact.count({ where }),
    ]);

    return new PaginatedResponseDto(data, total, query);
  }

  async findOne(orgId: string, contactId: string) {
    const contact = await this.prisma.contact.findFirst({
      where: { id: contactId, organizationId: orgId },
      include: {
        contactTags: {
          include: { tag: true },
        },
        _count: { select: { conversations: true } },
      },
    });

    if (!contact) {
      throw new NotFoundException(`Contact ${contactId} not found`);
    }

    return contact;
  }

  async create(orgId: string, dto: CreateContactDto) {
    return this.prisma.contact.create({
      data: {
        organizationId: orgId,
        name: dto.name,
        email: dto.email,
        phone: dto.phone,
        channel: dto.channel,
        metadata: dto.metadata as any,
      },
      include: {
        contactTags: {
          include: { tag: true },
        },
      },
    });
  }

  async update(orgId: string, contactId: string, dto: UpdateContactDto) {
    await this.findOne(orgId, contactId);

    return this.prisma.contact.update({
      where: { id: contactId },
      data: {
        name: dto.name,
        email: dto.email,
        phone: dto.phone,
        channel: dto.channel,
        metadata: dto.metadata as any,
      },
      include: {
        contactTags: {
          include: { tag: true },
        },
      },
    });
  }

  async remove(orgId: string, contactId: string) {
    await this.findOne(orgId, contactId);
    await this.prisma.contact.delete({ where: { id: contactId } });
  }

  async merge(orgId: string, primaryId: string, secondaryId: string) {
    const [primary, secondary] = await Promise.all([
      this.findOne(orgId, primaryId),
      this.findOne(orgId, secondaryId),
    ]);

    // Reassign all conversations from secondary to primary
    await this.prisma.conversation.updateMany({
      where: { contactId: secondary.id, organizationId: orgId },
      data: { contactId: primary.id },
    });

    // Delete secondary contact (cascades contact_tags)
    await this.prisma.contact.delete({ where: { id: secondary.id } });

    return this.findOne(orgId, primaryId);
  }

  async addTag(orgId: string, contactId: string, tagId: string) {
    // Verify contact belongs to org
    await this.findOne(orgId, contactId);

    // Verify tag belongs to org
    const tag = await this.prisma.tag.findFirst({
      where: { id: tagId, organizationId: orgId },
    });
    if (!tag) {
      throw new NotFoundException(`Tag ${tagId} not found`);
    }

    await this.prisma.contactTag.upsert({
      where: { contactId_tagId: { contactId, tagId } },
      update: {},
      create: { contactId, tagId },
    });

    return this.findOne(orgId, contactId);
  }

  async removeTag(orgId: string, contactId: string, tagId: string) {
    await this.findOne(orgId, contactId);

    await this.prisma.contactTag.deleteMany({
      where: { contactId, tagId },
    });
  }
}
