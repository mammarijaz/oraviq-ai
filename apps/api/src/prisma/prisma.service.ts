import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { env } from '../config/env';

/**
 * The unscoped ("system") Prisma client. Use it only where there is no tenant
 * yet: login, resolving a webhook or publishable key to a tenant, the outbox
 * and job tables. Tenant data goes through DbService (scoped).
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      adapter: new PrismaPg({ connectionString: env().DATABASE_URL }),
      log: [{ emit: 'stdout', level: 'warn' }],
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
    this.logger.log('Database disconnected');
  }
}
