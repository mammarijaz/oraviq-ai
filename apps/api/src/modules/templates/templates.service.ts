import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateTemplateDto } from './dto/create-template.dto';
import { UpdateTemplateDto } from './dto/update-template.dto';

@Injectable()
export class TemplatesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(orgId: string, category?: string) {
    return this.prisma.cannedResponse.findMany({
      where: {
        organizationId: orgId,
        ...(category ? { category } : {}),
      },
      orderBy: { title: 'asc' },
    });
  }

  async findByShortcut(orgId: string, shortcut: string) {
    const template = await this.prisma.cannedResponse.findFirst({
      where: { organizationId: orgId, shortcut },
    });
    if (!template) throw new NotFoundException(`Template with shortcut "${shortcut}" not found`);
    return template;
  }

  create(orgId: string, dto: CreateTemplateDto) {
    return this.prisma.cannedResponse.create({
      data: {
        organizationId: orgId,
        title: dto.title,
        shortcut: dto.shortcut,
        content: dto.content,
        category: dto.category,
      },
    });
  }

  async update(orgId: string, id: string, dto: UpdateTemplateDto) {
    await this.findOne(orgId, id);
    return this.prisma.cannedResponse.update({
      where: { id },
      data: dto,
    });
  }

  async remove(orgId: string, id: string) {
    await this.findOne(orgId, id);
    return this.prisma.cannedResponse.delete({ where: { id } });
  }

  private async findOne(orgId: string, id: string) {
    const template = await this.prisma.cannedResponse.findFirst({
      where: { id, organizationId: orgId },
    });
    if (!template) throw new NotFoundException(`Template ${id} not found`);
    return template;
  }
}
