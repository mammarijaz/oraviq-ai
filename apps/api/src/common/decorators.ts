import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Role } from '@oraviq/shared';

export const IS_PUBLIC = 'oraviq:public';
/** Skip JWT auth (public widget routes, webhooks, auth endpoints). */
export const Public = () => SetMetadata(IS_PUBLIC, true);

export const ROLES = 'oraviq:roles';
export const Roles = (...roles: Role[]) => SetMetadata(ROLES, roles);

export interface AuthUser {
  userId: string;
  tenantId: string;
  role: Role;
}

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => {
  return ctx.switchToHttp().getRequest().user as AuthUser;
});
