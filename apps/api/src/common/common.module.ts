import { Module } from '@nestjs/common';
import { ClsModule } from 'nestjs-cls';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { TenantInterceptor } from './interceptors/tenant.interceptor';
import { TransformInterceptor } from './interceptors/transform.interceptor';
import { HttpExceptionFilter } from './filters/http-exception.filter';
import { PrismaExceptionFilter } from './filters/prisma-exception.filter';

@Module({
  imports: [
    ClsModule.forRoot({
      middleware: { mount: true },
    }),
  ],
  providers: [
    JwtAuthGuard,
    RolesGuard,
    TenantInterceptor,
    TransformInterceptor,
    HttpExceptionFilter,
    PrismaExceptionFilter,
  ],
  exports: [
    ClsModule,
    JwtAuthGuard,
    RolesGuard,
    TenantInterceptor,
    TransformInterceptor,
    HttpExceptionFilter,
    PrismaExceptionFilter,
  ],
})
export class CommonModule {}
