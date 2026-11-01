import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Queue, Worker, type JobsOptions } from 'bullmq';
import IORedis from 'ioredis';
import { env } from '../config/env';

export type QueueName = 'webhooks' | 'outbox' | 'scheduled';
type Handler = (data: any) => Promise<void>;

/**
 * Job execution. Handlers register by queue name. With INLINE_JOBS=true the
 * handler runs in-process right away (local dev, tests: no Redis needed);
 * otherwise jobs go to BullMQ and src/worker.ts runs the processors.
 * Durable state lives in Postgres (webhook_events, outbox, scheduled_actions);
 * Redis only executes, so a lost job is re-found by the pollers.
 */
@Injectable()
export class JobsService implements OnModuleDestroy {
  private readonly logger = new Logger('Jobs');
  private readonly handlers = new Map<QueueName, Handler>();
  private readonly queues = new Map<QueueName, Queue>();
  private readonly workers: Worker[] = [];
  private connection?: IORedis;

  get inline(): boolean {
    return env().inlineJobs;
  }

  register(queue: QueueName, handler: Handler): void {
    this.handlers.set(queue, handler);
  }

  private redis(): IORedis {
    if (!this.connection) this.connection = new IORedis(env().REDIS_URL, { maxRetriesPerRequest: null, lazyConnect: false });
    return this.connection;
  }

  private queue(name: QueueName): Queue {
    let q = this.queues.get(name);
    if (!q) {
      q = new Queue(name, { connection: this.redis(), prefix: 'oraviq' });
      this.queues.set(name, q);
    }
    return q;
  }

  async enqueue(queue: QueueName, data: Record<string, unknown>, opts: JobsOptions = {}): Promise<void> {
    if (this.inline) {
      const h = this.handlers.get(queue);
      if (!h) {
        this.logger.warn(`No handler for ${queue}`);
        return;
      }
      try {
        await h(data);
      } catch (e) {
        this.logger.error(`Inline job ${queue} failed: ${(e as Error).stack ?? e}`);
      }
      return;
    }
    await this.queue(queue).add(queue, data, {
      removeOnComplete: 1000,
      removeOnFail: 5000,
      attempts: 5,
      backoff: { type: 'exponential', delay: 2000 },
      ...opts,
    });
  }

  /** Worker process: start BullMQ processors for every registered handler. */
  startWorkers(concurrency = 5): void {
    for (const [name, handler] of this.handlers) {
      const w = new Worker(name, async (job) => handler(job.data), { connection: this.redis(), prefix: 'oraviq', concurrency });
      w.on('failed', (job, err) => this.logger.warn(`${name} job ${job?.id} failed: ${err.message}`));
      this.workers.push(w);
      this.logger.log(`Processor started: ${name}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.allSettled(this.workers.map((w) => w.close()));
    await Promise.allSettled([...this.queues.values()].map((q) => q.close()));
    if (this.connection) this.connection.disconnect();
  }
}
