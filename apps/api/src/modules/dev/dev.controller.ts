import { Body, Controller, ForbiddenException, Get, HttpCode, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser, Public, type AuthUser } from '../../common/decorators';
import { env } from '../../config/env';
import { MockMessagingAdapter } from '../../integrations/mock/mock-messaging.adapter';
import { OutboxService } from '../../jobs/outbox.service';
import { ScheduledActionsService } from '../../jobs/scheduled-actions.service';
import { DbService } from '../../prisma/db.service';
import { WebhooksService } from '../webhooks/webhooks.service';

/** Development helpers. Disabled in production. */
@ApiTags('dev')
@Controller('dev')
export class DevController {
  constructor(
    private readonly webhooks: WebhooksService,
    private readonly scheduled: ScheduledActionsService,
    private readonly outbox: OutboxService,
    private readonly dbs: DbService,
  ) {}

  private guard() {
    if (env().isProduction) throw new ForbiddenException('Not available in production.');
  }

  /** Mock checkout: marks a mock session paid via the same pipeline as Stripe's checkout.session.completed. */
  @Public()
  @Post('payments/:sessionId/pay')
  @HttpCode(200)
  async pay(@Param('sessionId') sessionId: string) {
    this.guard();
    const order = await this.dbs.system.order.findFirst({ where: { paymentSessionId: sessionId } });
    if (!order) return { ok: false, message: 'Unknown session.' };
    const r = await this.webhooks.receiveMock('stripe', {
      id: `evt_mock_${sessionId}`,
      type: 'checkout.session.completed',
      data: { object: { id: sessionId, payment_status: 'paid', amount_total: order.depositCents, metadata: { orderId: order.id, tenantId: order.tenantId } } },
    });
    return { ok: true, duplicate: r.duplicate };
  }

  /** Runs due scheduled actions now (review requests) and flushes the outbox. */
  @Post('jobs/run')
  @HttpCode(200)
  async runJobs(@Body() body: { now?: string }) {
    this.guard();
    const n = await this.scheduled.runDue(body?.now ? new Date(body.now) : new Date());
    const m = await this.outbox.flush();
    return { scheduled: n, outbox: m };
  }

  /** Recent sends through the mock messaging adapter (this tenant). */
  @Get('mock/sent')
  sent(@CurrentUser() user: AuthUser) {
    this.guard();
    return { items: MockMessagingAdapter.sent.filter((m) => m.tenantId === user.tenantId).slice(-50) };
  }
}
