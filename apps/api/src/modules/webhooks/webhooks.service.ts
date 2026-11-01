import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ChannelType } from '@prisma/client';

interface VerifyQuery {
  'hub.mode'?: string;
  'hub.verify_token'?: string;
  'hub.challenge'?: string;
}

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  // In production, pull this from env / org settings
  private readonly VERIFY_TOKEN =
    process.env.WEBHOOK_VERIFY_TOKEN ?? 'oraviq-verify-token';

  constructor(private readonly prisma: PrismaService) {}

  async processWebhook(
    channel: ChannelType,
    eventType: string,
    orgId: string | null,
    payload: unknown,
  ): Promise<{ status: string }> {
    this.logger.log(
      `Received ${channel} webhook event="${eventType}" org=${orgId ?? 'unresolved'}`,
    );

    if (orgId) {
      await this.prisma.webhookEvent.create({
        data: {
          organizationId: orgId,
          channel,
          eventType,
          payload: payload as object,
          status: 'pending',
        },
      });
    } else {
      // TODO: resolve orgId from channel-specific identifiers (e.g. phone number)
      // For now, log the event but skip DB persistence to avoid FK violation
      this.logger.warn(
        `Could not resolve organizationId for ${channel} webhook — event not persisted`,
      );
    }

    // TODO: dispatch to channel-specific handler (Phase 2)
    return { status: 'received' };
  }

  verifyWhatsApp(query: VerifyQuery): string | null {
    return this.verifyMeta(query);
  }

  verifyInstagram(query: VerifyQuery): string | null {
    return this.verifyMeta(query);
  }

  private verifyMeta(query: VerifyQuery): string | null {
    if (
      query['hub.mode'] === 'subscribe' &&
      query['hub.verify_token'] === this.VERIFY_TOKEN
    ) {
      this.logger.log('Webhook verified successfully');
      return query['hub.challenge'] ?? null;
    }
    this.logger.warn('Webhook verification failed');
    return null;
  }
}
