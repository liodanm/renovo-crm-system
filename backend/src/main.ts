import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';

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

function logIntegrationStatus() {
  const integrations: Array<{ name: string; requiredVars: string[]; feature: string }> = [
    { name: 'Twilio (SMS)', requiredVars: ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_PHONE_NUMBER'], feature: 'automation SMS reminders, AI receptionist' },
    { name: 'Postmark (email)', requiredVars: ['POSTMARK_SERVER_TOKEN', 'MAIL_FROM_ADDRESS'], feature: 'all transactional/automation email' },
    { name: 'Stripe (payments)', requiredVars: ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET'], feature: 'portal invoice payment' },
    { name: 'AWS S3 (file storage)', requiredVars: ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_S3_BUCKET'], feature: 'photo uploads' },
  ];

  // eslint-disable-next-line no-console
  console.log('\n--- Integration status ---');
  for (const integration of integrations) {
    const missing = integration.requiredVars.filter((key) => !process.env[key]);
    if (missing.length === 0) {
      // eslint-disable-next-line no-console
      console.log(`  [OK] ${integration.name}`);
    } else {
      // eslint-disable-next-line no-console
      console.warn(`  [NOT CONFIGURED] ${integration.name} — ${integration.feature} will not work. Missing: ${missing.join(', ')}`);
    }
  }
  // eslint-disable-next-line no-console
  console.log('---------------------------\n');
}

async function bootstrap() {
  assertRequiredEnvVars();
  logIntegrationStatus();

  const app = await NestFactory.create(AppModule, { rawBody: true, bufferLogs: true }); // Stripe webhook signature verification needs the exact raw bytes sent, not a re-serialized JSON.parse(body) — see PortalController.handleStripeWebhook
  app.useLogger(app.get(Logger)); // pino replaces Nest's default console logger for everything from here on — bufferLogs above holds early framework logs (module init, route mapping) until this line, so nothing before it is lost to the old logger

  app.use(helmet());
  app.use(cookieParser());

  // Two distinct frontends now exist (staff CRM + customer portal, see
  // portal/), each its own origin — a single hardcoded FRONTEND_URL would
  // silently break the portal once its frontend is deployed. Both are
  // explicit, known origins (never a wildcard/regex "allow everything",
  // which would defeat the point of credentialed CORS).
  const allowedOrigins = [process.env.FRONTEND_URL, process.env.PORTAL_URL].filter((origin): origin is string => Boolean(origin));
  app.enableCors({
    origin: allowedOrigins.length > 0 ? allowedOrigins : 'http://localhost:3000',
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
