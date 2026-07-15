import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Inject } from '@nestjs/common';
import { Request, Response } from 'express';
import { PinoLogger } from 'nestjs-pino';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(@Inject(PinoLogger) private readonly logger: PinoLogger) {
    this.logger.setContext(AllExceptionsFilter.name);
  }

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const isHttpException = exception instanceof HttpException;
    const statusCode = isHttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    const body = isHttpException
      ? this.buildHttpExceptionBody(exception, statusCode, request.url)
      : { statusCode, message: 'Internal server error', timestamp: new Date().toISOString(), path: request.url };

    const logPayload = {
      statusCode,
      path: request.url,
      method: request.method,
      userId: (request as any).user?.userId,
      companyId: (request as any).user?.companyId,
    };

    if (statusCode >= 500) {
      this.logger.error({ ...logPayload, err: exception }, 'Unhandled exception');
    } else {
      const logMessage = typeof body.message === 'string' ? body.message : JSON.stringify(body);
      this.logger.warn(logPayload, logMessage);
    }

    response.status(statusCode).json(body);
  }

  private buildHttpExceptionBody(exception: HttpException, statusCode: number, path: string): Record<string, unknown> {
    const original = exception.getResponse();
    const timestamp = new Date().toISOString();

    if (typeof original === 'string') {
      return { statusCode, message: original, timestamp, path };
    }

    if (typeof original === 'object' && original !== null) {
      if ('message' in original) {
        const msg = (original as { message: unknown }).message;
        const message = Array.isArray(msg) ? msg.join(', ') : String(msg);
        return { statusCode, ...original, message, timestamp, path };
      }
      return { statusCode, timestamp, path, ...original };
    }

    return { statusCode, message: exception.message, timestamp, path };
  }
}
