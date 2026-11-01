import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateTagDto } from './dto/create-tag.dto';
import { UpdateTagDto } from './dto/update-tag.dto';

@Injectable()
export class TagsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(orgId: string) {
    return this.prisma.tag.findMany({
      where: { organizationId: orgId },
      orderBy: { name: 'asc' },
    });
  }

  async create(orgId: string, dto: CreateTagDto) {
    const existing = await this.prisma.tag.findUnique({
      where: { organizationId_name: { organizationId: orgId, name: dto.name } },
    });
    if (existing) {
      throw new ConflictException(`Tag "${dto.name}" already exists`);
    }
    return this.prisma.tag.create({
      data: {
        organizationId: orgId,
        name: dto.name,
        color: dto.color ?? '#6B7280',
      },
    });
  }

  async update(orgId: string, tagId: string, dto: UpdateTagDto) {
    await this.findOne(orgId, tagId);
    return this.prisma.tag.update({
      where: { id: tagId },
      data: dto,
    });
  }

  async remove(orgId: string, tagId: string) {
    await this.findOne(orgId, tagId);
    // Cascade handled by Prisma schema (onDelete: Cascade on ContactTag / ConversationTag)
    return this.prisma.tag.delete({ where: { id: tagId } });
  }

  private async findOne(orgId: string, tagId: string) {
    const tag = await this.prisma.tag.findFirst({
      where: { id: tagId, organizationId: orgId },
    });
    if (!tag) throw new NotFoundException(`Tag ${tagId} not found`);
    return tag;
  }
}
