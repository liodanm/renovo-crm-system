import { NestFactory } from '@nestjs/core';
import { ValidationPipe, INestApplication } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { IntegrationStatusService } from './common/integrations/integration-status.service';

/**
 * DATABASE_URL/PORTAL_JWT_SECRET (and JWT_ACCESS_SECRET/JWT_REFRESH_SECRET,
 * checked separately via requireEnv() in config/auth.config.ts) are truly
 * required — the app cannot function at all without them, so it refuses
 * to start.
 *
 * Twilio/Postmark/Stripe/AWS are deliberately NOT in this hard-fail list —
 * every service in this codebase already degrades gracefully when one of
 * these is missing (logs a clear message, skips the send/charge/upload,
 * never crashes). That design is correct for local development and
 * intentional, not an oversight. What WAS missing is visibility: without
 * this, the only way to discover a misconfigured Twilio key is watching a
 * customer never receive a reminder text. logIntegrationStatus() below is
 * the fix — a clear, printed-at-every-boot report of exactly what's live.
 */
function assertRequiredEnvVars() {
  const required = ['DATABASE_URL', 'PORTAL_JWT_SECRET'];
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    // eslint-disable-next-line no-console
    console.error(`Refusing to start: missing required environment variable(s): ${missing.join(', ')}`);
    process.exit(1);
  }
}

function logIntegrationStatus(app: INestApplication) {
  // Resolved from the same DI-registered service Settings' new
  // Payment/Email/SMS/Storage pages read at request time — this was a
  // second, hand-maintained copy of the same env-var list before;
  // eliminated by moving this call to after app creation (it only needs
  // optional integrations, unlike assertRequiredEnvVars above, which
  // must run before anything else since a broken DATABASE_URL could
  // hang module initialization itself).
  const service = app.get(IntegrationStatusService);
  // eslint-disable-next-line no-console
  console.log('\n--- Integration status ---');
  for (const integration of service.getAll()) {
    if (integration.configured) {
      // eslint-disable-next-line no-console
      console.log(`  [OK] ${integration.name}`);
    } else {
      // eslint-disable-next-line no-console
      console.warn(`  [NOT CONFIGURED] ${integration.name} — ${integration.feature} will not work. Missing: ${integration.missingVars.join(', ')}`);
    }
  }
  // eslint-disable-next-line no-console
  console.log('---------------------------\n');
}

async function bootstrap() {
  assertRequiredEnvVars();

  const app = await NestFactory.create(AppModule, { rawBody: true, bufferLogs: true }); // Stripe webhook signature verification needs the exact raw bytes sent, not a re-serialized JSON.parse(body) — see PortalController.handleStripeWebhook
  app.useLogger(app.get(Logger)); // pino replaces Nest's default console logger for everything from here on — bufferLogs above holds early framework logs (module init, route mapping) until this line, so nothing before it is lost to the old logger

  logIntegrationStatus(app);

  app.use(helmet());
  app.use(cookieParser());

  // Two distinct frontends now exist (staff CRM + customer portal, see
  // portal/), each its own origin — a single hardcoded FRONTEND_URL would
  // silently break the portal once its frontend is deployed. Both are
  // explicit, known origins (never a wildcard/regex "allow everything",
  // which would defeat the point of credentialed CORS).
  // localhost is always allowed, not just as a fallback when FRONTEND_URL
  // is unset — a solo operator testing locally against this exact
  // production backend (a real, deliberate part of this project's
  // workflow) needs both to work at once, not one or the other depending
  // on whether FRONTEND_URL happens to be configured.
  const allowedOrigins = ['http://localhost:3000', process.env.FRONTEND_URL, process.env.PORTAL_URL ?? 'https://portal.renovocrm.com'].filter(
    (origin): origin is string => Boolean(origin),
  );
  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // strip properties not defined on the DTO
      forbidNonWhitelisted: true, // reject requests with unexpected fields
      transform: true,
    }),
  );

  app.setGlobalPrefix('api/v1', { exclude: ['auth/google', 'auth/google/callback', 'auth/microsoft', 'auth/microsoft/callback', 'health'] });

  await app.listen(process.env.PORT ?? 4000);
}
bootstrap();
