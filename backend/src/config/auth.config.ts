import { registerAs } from '@nestjs/config';

export default registerAs('auth', () => ({
  jwt: {
    accessSecret: requireEnv('JWT_ACCESS_SECRET'),
    refreshSecret: requireEnv('JWT_REFRESH_SECRET'),
    accessTtlSeconds: parseInt(process.env.JWT_ACCESS_TTL_SECONDS ?? '900', 10), // 15 min
    refreshTtlSeconds: parseInt(process.env.JWT_REFRESH_TTL_SECONDS ?? '2592000', 10), // 30 days
    issuer: process.env.JWT_ISSUER ?? 'renovo-crm',
  },
  password: {
    // Argon2id parameters — tuned for ~250-400ms hash time on typical API hardware.
    memoryCost: 19456, // 19 MiB
    timeCost: 2,
    parallelism: 1,
  },
  tokens: {
    // Short-lived, single-use tokens for email verification / password reset,
    // stored hashed in Redis with a TTL rather than a DB table — they are
    // inherently ephemeral and don't need durable storage or audit history.
    emailVerificationTtlSeconds: 60 * 60 * 24, // 24h
    passwordResetTtlSeconds: 60 * 60, // 1h
  },
  security: {
    maxLoginAttemptsPerWindow: 5,
    loginLockoutWindowSeconds: 15 * 60,
    loginLockoutDurationSeconds: 15 * 60,
  },
  oauth: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID ?? '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
      callbackUrl: process.env.GOOGLE_CALLBACK_URL ?? 'http://localhost:4000/auth/google/callback',
    },
    microsoft: {
      clientId: process.env.MICROSOFT_CLIENT_ID ?? '',
      clientSecret: process.env.MICROSOFT_CLIENT_SECRET ?? '',
      tenantId: process.env.MICROSOFT_TENANT_ID ?? 'common',
      callbackUrl: process.env.MICROSOFT_CALLBACK_URL ?? 'http://localhost:4000/auth/microsoft/callback',
    },
  },
  frontendUrl: process.env.FRONTEND_URL ?? 'http://localhost:3000',
}));

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}
