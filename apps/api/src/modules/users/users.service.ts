import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { PaginationDto } from './dto/pagination.dto';
import { UpdateUserDto } from './dto/update-user.dto';

const BCRYPT_ROUNDS = 10;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(orgId: string, pagination: PaginationDto) {
    const { page = 1, limit = 20 } = pagination;
    const skip = (page - 1) * limit;

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where: { organizationId: orgId, status: { not: 'DISABLED' } },
        skip,
        take: limit,
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          organizationId: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.count({
        where: { organizationId: orgId, status: { not: 'DISABLED' } },
      }),
    ]);

    return {
      data: users,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(orgId: string, userId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, organizationId: orgId, status: { not: 'DISABLED' } },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        organizationId: true,
      },
    });

    if (!user) {
      throw new NotFoundException(`User ${userId} not found`);
    }

    return user;
  }

  async create(orgId: string, dto: CreateUserDto) {
    const existing = await this.prisma.user.findUnique({
      where: { organizationId_email: { organizationId: orgId, email: dto.email } },
    });
    if (existing) {
      throw new ConflictException('Email already in use');
    }

    const hashedPassword = dto.password
      ? await bcrypt.hash(dto.password, BCRYPT_ROUNDS)
      : await bcrypt.hash(this.generateTempPassword(), BCRYPT_ROUNDS);

    const user = await this.prisma.user.create({
      data: {
        name: dto.name,
        email: dto.email,
        passwordHash: hashedPassword,
        role: dto.role,
        status: 'ACTIVE',
        organizationId: orgId,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        organizationId: true,
      },
    });

    return user;
  }

  async update(orgId: string, userId: string, dto: UpdateUserDto) {
    await this.findOne(orgId, userId);

    const data: Record<string, any> = {
      ...(dto.name && { name: dto.name }),
      ...(dto.email && { email: dto.email }),
      ...(dto.role && { role: dto.role }),
    };

    if (dto.password) {
      data.passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    }

    return this.prisma.user.update({
      where: { id: userId },
      data,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        organizationId: true,
      },
    });
  }

  async remove(orgId: string, userId: string) {
    await this.findOne(orgId, userId);

    return this.prisma.user.update({
      where: { id: userId },
      data: { status: 'DISABLED' },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        status: true,
        updatedAt: true,
      },
    });
  }

  async inviteUser(orgId: string, dto: CreateUserDto) {
    const existing = await this.prisma.user.findUnique({
      where: { organizationId_email: { organizationId: orgId, email: dto.email } },
    });
    if (existing) {
      throw new ConflictException('Email already in use');
    }

    const tempPassword = this.generateTempPassword();
    const hashedPassword = await bcrypt.hash(tempPassword, BCRYPT_ROUNDS);

    const user = await this.prisma.user.create({
      data: {
        name: dto.name,
        email: dto.email,
        passwordHash: hashedPassword,
        role: dto.role,
        status: 'INVITED',
        organizationId: orgId,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        status: true,
        createdAt: true,
        organizationId: true,
      },
    });

    return user;
  }

  private generateTempPassword(): string {
    return Math.random().toString(36).slice(-12) + 'A1!';
  }
}
