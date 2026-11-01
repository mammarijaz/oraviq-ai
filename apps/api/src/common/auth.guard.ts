import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Role } from '@oraviq/shared';
import { TenantContext } from '../core/tenant-context';
import { IS_PUBLIC, ROLES } from './decorators';

export interface AccessTokenPayload {
  sub: string;
  tid: string;
  role: Role;
  typ: 'access';
}

/** Global guard: verifies the bearer token and puts tenant + user into the request context. */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly ctx: TenantContext,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    if (context.getType() !== 'http') return true;
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [context.getHandler(), context.getClass()]);
    if (isPublic) return true;
    const req = context.switchToHttp().getRequest();
    const header: string | undefined = req.headers?.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7).trim() : undefined;
    if (!token) throw new UnauthorizedException('Sign in to continue.');
    let payload: AccessTokenPayload;
    try {
      payload = this.jwt.verify<AccessTokenPayload>(token);
    } catch {
      throw new UnauthorizedException('Your session has expired. Sign in again.');
    }
    if (payload.typ !== 'access' || !payload.tid) throw new UnauthorizedException('Invalid token.');
    req.user = { userId: payload.sub, tenantId: payload.tid, role: payload.role };
    this.ctx.set({ tenantId: payload.tid, userId: payload.sub, role: payload.role });

    const roles = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES, [context.getHandler(), context.getClass()]);
    if (roles?.length && !roles.includes(payload.role)) throw new ForbiddenException('Only the owner or an admin can do that.');
    return true;
  }
}
