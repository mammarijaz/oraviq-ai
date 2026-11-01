import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { AuthResponse, AuthTokens, RegisterRequest, Role, TenantDto, UserDto } from '@oraviq/shared';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'node:crypto';
import type { AccessTokenPayload } from '../../common/auth.guard';
import { env } from '../../config/env';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantService, toTenantDto } from '../tenant/tenant.service';

const hash = (t: string) => createHash('sha256').update(t).digest('hex');

/** Email + password login, short-lived JWT access tokens, rotating opaque refresh tokens. */
@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly tenants: TenantService,
  ) {}

  private async issue(userId: string, tenantId: string, role: Role, replacing?: string): Promise<AuthTokens> {
    const e = env();
    const payload: AccessTokenPayload = { sub: userId, tid: tenantId, role, typ: 'access' };
    const accessToken = this.jwt.sign(payload, { expiresIn: e.ACCESS_TOKEN_TTL_SECONDS });
    const refreshToken = `rt_${randomBytes(32).toString('base64url')}`;
    const row = await this.prisma.refreshToken.create({
      data: { userId, tenantId, tokenHash: hash(refreshToken), expiresAt: new Date(Date.now() + e.REFRESH_TOKEN_TTL_DAYS * 86400000) },
    });
    if (replacing) await this.prisma.refreshToken.update({ where: { id: replacing }, data: { revokedAt: new Date(), replacedById: row.id } });
    return { accessToken, refreshToken, expiresIn: e.ACCESS_TOKEN_TTL_SECONDS };
  }

  private userDto(u: { id: string; name: string; email: string; phone: string | null }, role: Role): UserDto {
    return { id: u.id, name: u.name, email: u.email, role, phone: u.phone };
  }

  async register(req: RegisterRequest): Promise<AuthResponse> {
    const problems: string[] = [];
    if (!req.businessName?.trim()) problems.push('Enter your business name.');
    if (!req.ownerName?.trim()) problems.push('Enter your name.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(req.email ?? '')) problems.push('Enter a valid email.');
    if (!req.password || req.password.length < 8) problems.push('Use a password of at least 8 characters.');
    if (problems.length) throw new BadRequestException({ statusCode: 400, error: 'Bad Request', message: problems.join(' '), problems });
    const { tenant, user, role } = await this.tenants.provision(req);
    const tokens = await this.issue(user.id, tenant.id, role);
    return { ...tokens, user: this.userDto(user, role), tenant: toTenantDto(tenant) };
  }

  async login(email: string, password: string): Promise<AuthResponse> {
    const user = await this.prisma.user.findUnique({ where: { email: String(email ?? '').trim().toLowerCase() }, include: { memberships: { include: { tenant: true }, orderBy: { createdAt: 'asc' } } } });
    const ok = user && !user.passwordHash.startsWith('!') && (await bcrypt.compare(String(password ?? ''), user.passwordHash));
    if (!user || !ok) throw new UnauthorizedException('That email and password don\'t match.');
    const m = user.memberships[0];
    if (!m) throw new UnauthorizedException('This account is not part of a business yet.');
    const tokens = await this.issue(user.id, m.tenantId, m.role);
    return { ...tokens, user: this.userDto(user, m.role), tenant: toTenantDto(m.tenant) };
  }

  async refresh(refreshToken: string): Promise<AuthTokens> {
    if (!refreshToken) throw new UnauthorizedException('Sign in again.');
    const row = await this.prisma.refreshToken.findUnique({ where: { tokenHash: hash(refreshToken) } });
    if (!row || row.expiresAt < new Date()) throw new UnauthorizedException('Your session has expired. Sign in again.');
    if (row.revokedAt) {
      // Reuse of a rotated token: revoke the whole family for this user.
      await this.prisma.refreshToken.updateMany({ where: { userId: row.userId, revokedAt: null }, data: { revokedAt: new Date() } });
      throw new UnauthorizedException('Your session has expired. Sign in again.');
    }
    const m = await this.prisma.membership.findUnique({ where: { tenantId_userId: { tenantId: row.tenantId, userId: row.userId } } });
    if (!m) throw new UnauthorizedException('You no longer have access to this business.');
    // Claim the token atomically: a concurrent second use is a reuse, not a second rotation.
    const claimed = await this.prisma.refreshToken.updateMany({ where: { id: row.id, revokedAt: null }, data: { revokedAt: new Date() } });
    if (!claimed.count) {
      await this.prisma.refreshToken.updateMany({ where: { userId: row.userId, revokedAt: null }, data: { revokedAt: new Date() } });
      throw new UnauthorizedException('Your session has expired. Sign in again.');
    }
    return this.issue(row.userId, row.tenantId, m.role, row.id);
  }

  async me(userId: string, tenantId: string): Promise<{ user: UserDto; tenant: TenantDto }> {
    const m = await this.prisma.membership.findUnique({ where: { tenantId_userId: { tenantId, userId } }, include: { user: true, tenant: true } });
    if (!m) throw new UnauthorizedException('Sign in again.');
    return { user: this.userDto(m.user, m.role), tenant: toTenantDto(m.tenant) };
  }
}
