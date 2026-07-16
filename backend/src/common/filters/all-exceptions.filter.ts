import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Inject } from '@nestjs/common';
import { Request, Response } from 'express';
import { PinoLogger } from 'nestjs-pino';

/**
 * This is the fix for last audit's "silent failure" finding at the
 * application-error layer (the startup integration-status report already
 * fixed it at the configuration layer). Before this filter existed,
 * NestJS's bare default handling meant an unexpected error was already
 * safe from leaking to the client (that part was never actually broken)
 * but had no guaranteed, structured, searchable server-side record either
 * — exactly the gap that makes a production issue hard to diagnose after
 * the fact, which is the whole point of an audit-focused readiness pass.
 *
 * The one rule this filter exists to enforce: HttpException (thrown
 * intentionally by application code — "Invalid Stripe signature," "FAQ
 * entry not found") is safe to show the client, because a developer
 * already decided that message was fine to expose. Anything else is an
 * unexpected failure and NEVER reaches the client beyond a generic
 * message — but is logged in full, with a stack trace, server-side.
 *
 * Real bug found in production (Railway), not caught by earlier testing:
 * the first version of this filter forced every HttpException response
 * into a single {message: string} shape — which silently discarded
 * richer, intentionally-informative bodies. The health check
 * (HealthController) throws exactly this kind of body on purpose —
 * {status, checks: {database, redis}} — specifically so a 503 tells you
 * WHICH dependency is down. Collapsing it to a generic "Http Exception"
 * defeated the entire purpose of that endpoint. Fixed by preserving the
 * original response body whenever it's a rich object, not just a string.
 */
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

    // Every exception gets logged server-side, regardless of whether it's
    // "expected" — a spike in 400s on one endpoint is itself a diagnostic
    // signal (a broken frontend build, a misbehaving client), not just
    // 500s. Severity reflects that: 5xx logs as an error (with the real
    // stack trace, since this is the one place that's actually needed),
    // 4xx logs as a warning (expected-ish, still worth knowing about).
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
        // class-validator's ValidationPipe throws BadRequestException with
        // message as a string[] (one entry per failed field) — join them
        // into one readable string rather than returning an array where
        // callers likely expect a string.
        const message = Array.isArray(msg) ? msg.join(', ') : String(msg);
        return { statusCode, ...original, message, timestamp, path };
      }
      // No `message` field — this is a deliberately-shaped body (the
      // health check's {status, checks} is the concrete example). Preserve
      // it whole rather than discarding it for a generic fallback.
      return { statusCode, timestamp, path, ...original };
    }

    return { statusCode, message: exception.message, timestamp, path };
  }
}
