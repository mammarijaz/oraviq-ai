import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Response } from 'express';
import { TenantScopeError } from '../prisma/tenant-prisma';

const REASONS: Record<number, string> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  409: 'Conflict',
  413: 'Payload Too Large',
  422: 'Unprocessable Entity',
  429: 'Too Many Requests',
  500: 'Internal Server Error',
  503: 'Service Unavailable',
};

/** Every error leaves the API as { statusCode, error, message } (+ problems when present). */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Errors');

  catch(exception: unknown, host: ArgumentsHost): void {
    if (host.getType() !== 'http') return;
    const res = host.switchToHttp().getResponse<Response>();
    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Something went wrong. Please try again.';
    let extra: Record<string, unknown> = {};

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'string') message = body;
      else if (body && typeof body === 'object') {
        const b = body as Record<string, unknown>;
        const m = b.message;
        message = Array.isArray(m) ? m.join('. ') : typeof m === 'string' ? m : exception.message;
        if (Array.isArray(m) && !b.problems) extra.problems = m;
        for (const [k, v] of Object.entries(b)) if (!['statusCode', 'error', 'message'].includes(k)) extra[k] = v;
      }
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2025') {
        statusCode = 404;
        message = 'Not found.';
      } else if (exception.code === 'P2002') {
        statusCode = 409;
        message = 'That already exists.';
      } else {
        this.logger.error(exception);
      }
    } else if (exception instanceof TenantScopeError) {
      this.logger.error(exception);
      statusCode = 500;
    } else {
      this.logger.error(exception instanceof Error ? exception.stack ?? exception.message : String(exception));
    }

    if (res.headersSent) return;
    res.status(statusCode).json({ statusCode, error: REASONS[statusCode] ?? 'Error', message, ...extra });
  }
}
