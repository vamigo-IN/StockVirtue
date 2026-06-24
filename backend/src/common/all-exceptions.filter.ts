import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const isHttp = exception instanceof HttpException;
    const status = isHttp
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;
    const message =
      exception instanceof Error ? exception.message : String(exception);

    if (status >= 500) {
      this.logger.error(
        message,
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    // 4xx (HttpException) bodies are controlled messages and safe to return.
    // For 5xx / non-HttpException, never leak the internal message/stack to the
    // client (Prisma/driver errors embed schema + query internals) — log it
    // server-side (above) and return a generic message.
    response.status(status).json({
      statusCode: status,
      message: isHttp
        ? (exception.getResponse() as object)
        : 'Internal server error',
      timestamp: new Date().toISOString(),
    });
  }
}
