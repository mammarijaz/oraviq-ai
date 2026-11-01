import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { ClsService } from 'nestjs-cls';

/**
 * PrismaService wraps PrismaClient with:
 *  - Automatic pg adapter wired to DATABASE_URL
 *  - Helper to get the current tenant's organizationId from CLS
 *
 * NOTE: Prisma v5+ removed $use() middleware. Tenant scoping is done
 * at the service layer by calling `tenantWhere()` to inject the
 * organizationId constraint, or via a Prisma Client Extension when needed.
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor(
    private readonly cls: ClsService,
    private readonly config: ConfigService,
  ) {
    const connectionString =
      config.get<string>('DATABASE_URL') ??
      'postgresql://oraviq:oraviq_dev@localhost:5432/oraviq?schema=public';

    const adapter = new PrismaPg({ connectionString });

    super({
      adapter,
      log: [
        { emit: 'stdout', level: 'error' },
        { emit: 'stdout', level: 'warn' },
      ],
    });
  }

  /**
   * Returns the current organizationId stored in the CLS context.
   * Service methods can use this to scope queries to the right tenant.
   */
  get currentOrganizationId(): string | undefined {
    return this.cls.get<string>('organizationId');
  }

  /**
   * Convenience helper that returns a partial `where` clause scoped
   * to the current tenant.  Use it as a spread in Prisma `where` objects:
   *
   *   const items = await this.prisma.contact.findMany({
   *     where: { ...this.prisma.tenantWhere(), name: { contains: search } },
   *   });
   */
  tenantWhere(): { organizationId?: string } {
    const organizationId = this.currentOrganizationId;
    return organizationId ? { organizationId } : {};
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Database connected');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
    this.logger.log('Database disconnected');
  }
}
