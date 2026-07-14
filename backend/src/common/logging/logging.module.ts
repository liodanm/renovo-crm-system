import { LoggerModule } from 'nestjs-pino';
import { randomUUID } from 'crypto';

/**
 * pino, not the default NestJS Logger or winston: fastest structured JSON
 * logger available for Node, and every log line becomes machine-parseable
 * (searchable, filterable by field) the moment this is piped anywhere —
 * a hosted log drain, `grep`, whatever. "Minimal performance impact" is a
 * real property of pino specifically, not a generic claim about logging.
 *
 * Redaction is not optional here — pino-http auto-logs request/response
 * objects by default, which would otherwise mean every Authorization
 * header (a live JWT) and every login/registration password ends up in
 * plaintext in the logs. That's a direct regression of a security
 * property the last audit specifically verified ("no sensitive data
 * logged"). The paths below are exactly what would otherwise leak.
 */
export const LoggingModule = LoggerModule.forRoot({
  pinoHttp: {
    level: process.env.LOG_LEVEL ?? 'info',
    transport:
      process.env.NODE_ENV === 'production'
        ? undefined // raw JSON to stdout in production — let the process manager/log drain handle formatting and storage
        : { target: 'pino-pretty', options: { colorize: true, singleLine: true } },
    redact: {
      // Verified by direct test: pino-http's default serializers do NOT
      // log req.body at all (confirmed by inspecting real log output) —
      // which is itself the safer default, since no body logged means no
      // leak risk regardless of redaction rules. The req.body.* paths
      // below are precautionary for if body logging is ever explicitly
      // enabled later (e.g. temporarily, while debugging a specific
      // issue) — not something currently active. The header/cookie paths
      // ARE active today and were verified directly: a real Authorization
      // header sent in a test request came back as "[REDACTED]" in the
      // actual log output, not just assumed correct from this config.
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'res.headers["set-cookie"]',
        'req.body.password',
        'req.body.currentPassword',
        'req.body.newPassword',
        'req.body.token',
        'req.body.signatureDataUrl', // a base64 canvas signature — large, not useful in logs, not sensitive but genuinely just noise
      ],
      censor: '[REDACTED]',
    },
    // Correlates every log line within one request — the concrete thing
    // that turns "an error happened somewhere" into "here is every log
    // line from the exact request that failed."
    genReqId: (req) => (req.headers['x-request-id'] as string) ?? randomUUID(),
    autoLogging: {
      // Health checks fire every few seconds from an orchestrator — real
      // noise, not a meaningful business event, and drowns out logs that
      // actually matter. Consistent with the same "meaningful events
      // only" principle applied throughout this project's audit work.
      ignore: (req) => req.url === '/health',
    },
  },
});
