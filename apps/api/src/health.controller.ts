import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from './common/decorators';
import { adapterModes, env } from './config/env';
import { PrismaService } from './prisma/prisma.service';

@ApiTags('health')
@Public()
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async health() {
    await this.prisma.$queryRaw`SELECT 1`;
    return { ok: true, inlineJobs: env().inlineJobs, adapters: adapterModes() };
  }
}
