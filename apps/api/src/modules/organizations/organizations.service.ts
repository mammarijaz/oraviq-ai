import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UpdateBusinessHoursDto } from './dto/update-business-hours.dto';
import { UpdateOrgDto } from './dto/update-org.dto';

@Injectable()
export class OrganizationsService {
  constructor(private readonly prisma: PrismaService) {}

  async findOne(orgId: string) {
    const organization = await this.prisma.organization.findUnique({
      where: { id: orgId },
    });

    if (!organization) {
      throw new NotFoundException('Organization not found');
    }

    return organization;
  }

  async update(orgId: string, dto: UpdateOrgDto) {
    await this.findOne(orgId);

    const data: Record<string, any> = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.industry !== undefined) data.industry = dto.industry;
    if (dto.timezone !== undefined) data.timezone = dto.timezone;
    if (dto.logo !== undefined) data.logo = dto.logo;
    if (dto.plan !== undefined) data.plan = dto.plan;

    return this.prisma.organization.update({
      where: { id: orgId },
      data,
    });
  }

  async getBusinessHours(orgId: string) {
    const organization = await this.prisma.organization.findUnique({
      where: { id: orgId },
      select: {
        id: true,
        businessHours: true,
        timezone: true,
      },
    });

    if (!organization) {
      throw new NotFoundException('Organization not found');
    }

    const dayNames = [
      'sunday',
      'monday',
      'tuesday',
      'wednesday',
      'thursday',
      'friday',
      'saturday',
    ];

    const hours =
      organization.businessHours.length > 0
        ? organization.businessHours.map((bh) => ({
            day: dayNames[bh.dayOfWeek] ?? `day-${bh.dayOfWeek}`,
            dayOfWeek: bh.dayOfWeek,
            enabled: bh.isOpen,
            openTime: bh.openTime,
            closeTime: bh.closeTime,
          }))
        : this.getDefaultBusinessHours();

    return {
      organizationId: organization.id,
      timezone: organization.timezone,
      hours,
    };
  }

  async updateBusinessHours(orgId: string, dto: UpdateBusinessHoursDto) {
    await this.findOne(orgId);

    // Update timezone on the organization if provided
    if (dto.timezone !== undefined) {
      await this.prisma.organization.update({
        where: { id: orgId },
        data: { timezone: dto.timezone },
      });
    }

    // Upsert each day's business hours into the BusinessHours table
    if (dto.hours && dto.hours.length > 0) {
      const dayNameToNumber: Record<string, number> = {
        sunday: 0,
        monday: 1,
        tuesday: 2,
        wednesday: 3,
        thursday: 4,
        friday: 5,
        saturday: 6,
      };

      await Promise.all(
        dto.hours.map((h) => {
          const dayOfWeek = dayNameToNumber[h.day.toLowerCase()];
          if (dayOfWeek === undefined) return Promise.resolve();
          return this.prisma.businessHours.upsert({
            where: {
              organizationId_dayOfWeek: { organizationId: orgId, dayOfWeek },
            },
            update: {
              isOpen: h.enabled,
              openTime: h.openTime,
              closeTime: h.closeTime,
            },
            create: {
              organizationId: orgId,
              dayOfWeek,
              isOpen: h.enabled,
              openTime: h.openTime,
              closeTime: h.closeTime,
            },
          });
        }),
      );
    }

    return this.getBusinessHours(orgId);
  }

  private getDefaultBusinessHours() {
    const dayNames = [
      'sunday',
      'monday',
      'tuesday',
      'wednesday',
      'thursday',
      'friday',
      'saturday',
    ];
    return dayNames.map((day, index) => ({
      day,
      dayOfWeek: index,
      enabled: index >= 1 && index <= 5, // Mon-Fri open
      openTime: '09:00',
      closeTime: '17:00',
    }));
  }
}
