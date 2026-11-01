import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import { PrismaService } from '../../prisma/prisma.service';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

const BCRYPT_ROUNDS = 10;

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto): Promise<TokenPair> {
    const hashedPassword = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    // Create org and admin user in a transaction
    const result = await this.prisma.$transaction(async (tx) => {
      const slug = dto.organizationName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');

      // Check if email already exists within a potential org
      const existingUser = await tx.user.findFirst({
        where: { email: dto.email },
      });
      if (existingUser) {
        throw new ConflictException('Email already registered');
      }

      const organization = await tx.organization.create({
        data: {
          name: dto.organizationName,
          slug: `${slug}-${Date.now()}`,
        },
      });

      const user = await tx.user.create({
        data: {
          name: dto.name,
          email: dto.email,
          passwordHash: hashedPassword,
          role: 'ADMIN',
          status: 'ACTIVE',
          organizationId: organization.id,
        },
      });

      return { organization, user };
    });

    return this.generateTokens(result.user);
  }

  async login(dto: LoginDto): Promise<TokenPair> {
    const user = await this.validateUser(dto.email, dto.password);
    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }
    return this.generateTokens(user);
  }

  async refreshToken(userId: string): Promise<TokenPair> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return this.generateTokens(user);
  }

  async forgotPassword(dto: ForgotPasswordDto): Promise<{ message: string }> {
    // Return success regardless to avoid email enumeration
    const user = await this.prisma.user.findFirst({
      where: { email: dto.email },
    });
    if (user) {
      // TODO: store a reset token (via metadata or separate table) and send an email.
      // The User schema intentionally omits reset token fields.
      const _resetToken = uuidv4();
      this.logger.log(`Password reset requested for ${dto.email}`);
    }

    return { message: 'If that email exists, a reset link has been sent.' };
  }

  async resetPassword(dto: ResetPasswordDto): Promise<{ message: string }> {
    // Placeholder: in production, look up a persisted reset token.
    void dto;
    throw new UnauthorizedException('Password reset is not yet implemented');
  }

  async validateUser(email: string, password: string): Promise<Omit<{
    id: string;
    email: string;
    organizationId: string;
    role: string;
    name: string;
    status: string;
  }, 'passwordHash'> | null> {
    const user = await this.prisma.user.findFirst({ where: { email } });
    if (!user) return null;

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) return null;

    const { passwordHash: _pw, ...result } = user;
    return result;
  }

  generateTokens(user: {
    id: string;
    email: string;
    organizationId: string;
    role: string;
  }): TokenPair {
    const payload = {
      sub: user.id,
      email: user.email,
      orgId: user.organizationId,
      role: user.role,
    };

    const accessToken = this.jwtService.sign(payload);
    const refreshToken = this.jwtService.sign(payload, { expiresIn: '7d' });

    return { accessToken, refreshToken };
  }
}
