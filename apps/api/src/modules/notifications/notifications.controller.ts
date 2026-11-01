import { BadRequestException, Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { NotificationDto } from '@oraviq/shared';
import { Prisma } from '@prisma/client';
import { CurrentUser, type AuthUser } from '../../common/decorators';
import { env } from '../../config/env';
import { DbService } from '../../prisma/db.service';

@ApiTags('notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly dbs: DbService) {}

  @Get()
  async list(): Promise<{ items: NotificationDto[] }> {
    const rows = await this.dbs.db.notification.findMany({ orderBy: { createdAt: 'desc' }, take: 50 });
    return { items: rows.map((n) => ({ id: n.id, title: n.title, body: n.body, href: n.href, createdAt: n.createdAt.toISOString(), read: !!n.readAt })) };
  }

  @Get('push-key')
  pushKey() {
    return { publicKey: env().VAPID_PUBLIC_KEY ?? null };
  }

  /** Web push subscription for the owner app (PWA). */
  @Post('push-subscriptions')
  @HttpCode(200)
  async subscribe(@CurrentUser() user: AuthUser, @Body() body: { endpoint: string; keys: { p256dh: string; auth: string } }) {
    if (!body?.endpoint || !body.keys?.p256dh || !body.keys?.auth) throw new BadRequestException('endpoint and keys are required.');
    await this.dbs.system.pushSubscription.upsert({
      where: { endpoint: body.endpoint },
      create: { tenantId: user.tenantId, userId: user.userId, endpoint: body.endpoint, keys: body.keys as unknown as Prisma.InputJsonValue },
      update: { tenantId: user.tenantId, userId: user.userId, keys: body.keys as unknown as Prisma.InputJsonValue },
    });
    return { ok: true };
  }
}
