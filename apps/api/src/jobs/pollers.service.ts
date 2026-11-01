import { Injectable, Logger, OnApplicationShutdown } from '@nestjs/common';
import { env } from '../config/env';
import { OutboxService } from './outbox.service';
import { ScheduledActionsService } from './scheduled-actions.service';

/** Outbox publisher + scheduled-actions poller. Runs in the worker, or in the API when jobs are inline. */
@Injectable()
export class PollersService implements OnApplicationShutdown {
  private readonly logger = new Logger('Pollers');
  private timers: NodeJS.Timeout[] = [];
  private busy = { outbox: false, scheduled: false };

  start(): void {
    if (this.timers.length) return;
    const tick = (key: 'outbox' | 'scheduled', fn: () => Promise<unknown>) => async () => {
      if (this.busy[key]) return;
      this.busy[key] = true;
      try {
        await fn();
      } catch (e) {
        this.logger.warn(`${key} poll failed: ${(e as Error).message}`);
      } finally {
        this.busy[key] = false;
      }
    };
    this.timers.push(setInterval(tick('outbox', () => this.outbox.flush()), 1000));
    this.timers.push(setInterval(tick('scheduled', () => this.scheduled.runDue()), 15000));
    this.timers.push(setInterval(() => void this.outbox.releaseStuck().then(() => this.scheduled.releaseStuck()).catch(() => undefined), 60000));
    for (const t of this.timers) t.unref?.();
    this.logger.log(`Pollers started (inline jobs: ${env().inlineJobs})`);
  }

  constructor(
    private readonly outbox: OutboxService,
    private readonly scheduled: ScheduledActionsService,
  ) {}

  onApplicationShutdown(): void {
    for (const t of this.timers) clearInterval(t);
    this.timers = [];
  }
}
