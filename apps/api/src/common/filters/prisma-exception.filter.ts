import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/client';
import { Response } from 'express';

@Catch(PrismaClientKnownRequestError)
export class PrismaExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(PrismaExceptionFilter.name);

  catch(
    exception: PrismaClientKnownRequestError,
    host: ArgumentsHost,
  ): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';

    switch (exception.code) {
      case 'P2002': {
        // Unique constraint violation
        statusCode = HttpStatus.CONFLICT;
        const fields = (exception.meta?.target as string[]) ?? [];
        message = `Unique constraint violation on field(s): ${fields.join(', ')}`;
        break;
      }
      case 'P2025': {
        // Record not found
        statusCode = HttpStatus.NOT_FOUND;
        message =
          (exception.meta?.cause as string) ?? 'Record not found';
        break;
      }
      case 'P2003': {
        // Foreign key constraint violation
        statusCode = HttpStatus.BAD_REQUEST;
        message = 'Foreign key constraint violation';
        break;
      }
      case 'P2014': {
        // Relation violation
        statusCode = HttpStatus.BAD_REQUEST;
        message = 'Relation constraint violation';
        break;
      }
      case 'P2016': {
        // Query interpretation error
        statusCode = HttpStatus.BAD_REQUEST;
        message = 'Query interpretation error';
        break;
      }
      default: {
        this.logger.error(
          `Unhandled Prisma error [${exception.code}]: ${exception.message}`,
        );
        break;
      }
    }

    response.status(statusCode).json({
      error: {
        statusCode,
        message,
        timestamp: new Date().toISOString(),
      },
    });
  }
}
