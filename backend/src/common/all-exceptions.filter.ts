import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';

/**
 * The body parser's own client errors (body-parser's `http-errors`, which
 * carry `type` and a 4xx `status`), with the sentence each one answers.
 * They are thrown before Nest's pipes run and aren't HttpExceptions, so
 * without this they became 500s. The one that matters most is
 * `entity.too.large`: a JSON body over the parser's limit (Nest's default
 * 100 KB) now answers a bare 413 (no `code`), which the portal maps to
 * "This page is too large to save. Shorten it, or split it into two pages."
 * (W7 addendum §7.6).
 */
const BODY_PARSER_ERRORS: Record<string, string> = {
  'entity.too.large': 'Request body is too large.',
  'parameters.too.many': 'Request has too many parameters.',
  'entity.parse.failed': 'Request body could not be read.',
  'request.aborted': 'Request was aborted.',
  'request.size.invalid': 'Request body did not match its declared size.',
  'encoding.unsupported': 'Request body encoding is not supported.',
  'charset.unsupported': 'Request body charset is not supported.',
};

/** The body parser's 4xx error as an HttpException with its own status, else null. */
function bodyParserError(exception: unknown): HttpException | null {
  if (!exception || typeof exception !== 'object') return null;
  const { type, status } = exception as { type?: unknown; status?: unknown };
  const text = typeof type === 'string' ? BODY_PARSER_ERRORS[type] : undefined;
  if (!text || typeof status !== 'number' || status < 400 || status > 499) {
    return null;
  }
  return new HttpException({ statusCode: status, message: text }, status);
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(caught: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const exception = bodyParserError(caught) ?? caught;
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

    // A guard may have already written the response (e.g. AdminGuard sends an
    // HTML redirect to /admin/login or a 403 page, then returns false — which
    // makes Nest raise a ForbiddenException that lands here). Re-sending would
    // throw ERR_HTTP_HEADERS_SENT, so bail out once the response is committed.
    if (response.headersSent) return;

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
