import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import type { ServerToClientEvents } from '@oraviq/shared';
import IORedis from 'ioredis';
import type { Namespace } from 'socket.io';
import { env } from '../config/env';

const CHANNEL = 'oraviq:realtime';
type EventName = keyof ServerToClientEvents;

/**
 * Fan-out of ServerToClientEvents to `tenant:{id}` rooms. Events come from the
 * outbox (after commit). In inline mode the API emits directly; otherwise the
 * publisher (worker or API) goes through Redis pub/sub and every API instance
 * emits to its own local sockets, so there are no duplicates.
 */
@Injectable()
export class RealtimeService implements OnModuleDestroy {
  private readonly logger = new Logger('Realtime');
  private ns?: Namespace;
  private pub?: IORedis;
  private sub?: IORedis;

  /** Called by the gateway once the /inbox namespace exists (API process only). */
  attach(ns: Namespace): void {
    this.ns = ns;
    if (!env().inlineJobs) {
      this.sub = new IORedis(env().REDIS_URL, { maxRetriesPerRequest: null });
      void this.sub.subscribe(CHANNEL);
      this.sub.on('message', (_ch, raw) => {
        try {
          const m = JSON.parse(raw) as { tenantId: string; event: EventName; payload: unknown };
          this.emitLocal(m.tenantId, m.event, m.payload);
        } catch (e) {
          this.logger.warn(`Bad realtime message: ${(e as Error).message}`);
        }
      });
    }
  }

  private emitLocal(tenantId: string, event: EventName, payload: unknown): void {
    this.ns?.local.to(`tenant:${tenantId}`).emit(event as string, payload);
  }

  async publish(tenantId: string, event: EventName, payload: unknown): Promise<void> {
    if (env().inlineJobs) {
      this.emitLocal(tenantId, event, payload);
      return;
    }
    if (!this.pub) this.pub = new IORedis(env().REDIS_URL, { maxRetriesPerRequest: null });
    await this.pub.publish(CHANNEL, JSON.stringify({ tenantId, event, payload }));
  }

  onModuleDestroy(): void {
    this.pub?.disconnect();
    this.sub?.disconnect();
  }
}
