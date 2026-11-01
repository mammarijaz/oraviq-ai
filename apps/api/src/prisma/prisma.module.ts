import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ClsModule } from 'nestjs-cls';
import { PrismaService } from './prisma.service';

@Global()
@Module({
  imports: [ConfigModule, ClsModule],
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
