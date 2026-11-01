import { BadRequestException, HttpException, HttpStatus } from '@nestjs/common';

/** 400 with the `problems` list the contract asks for (price-table validation, form errors). */
export class ProblemsException extends BadRequestException {
  constructor(message: string, problems: string[]) {
    super({ statusCode: 400, error: 'Bad Request', message, problems });
  }
}

/** 409 for refused actions on valid input (opt-outs, illegal state transitions). */
export class ConflictActionException extends HttpException {
  constructor(message: string, extra: Record<string, unknown> = {}) {
    super({ statusCode: 409, error: 'Conflict', message, ...extra }, HttpStatus.CONFLICT);
  }
}
