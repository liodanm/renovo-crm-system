import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import * as crypto from 'crypto';

@Injectable()
export class PasswordService {
  constructor(private readonly config: ConfigService) {}

  /** Argon2id — the OWASP-recommended choice over bcrypt/scrypt for new systems. */
  async hash(plainPassword: string): Promise<string> {
    const opts = this.config.get('auth.password');
    return argon2.hash(plainPassword, {
      type: argon2.argon2id,
      memoryCost: opts.memoryCost,
      timeCost: opts.timeCost,
      parallelism: opts.parallelism,
    });
  }

  async verify(hash: string, plainPassword: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, plainPassword);
    } catch {
      // Malformed hash (e.g. account created via OAuth-only, no password set)
      return false;
    }
  }

  /** Generates a cryptographically-random, URL-safe token for email verification / password reset links. */
  generateSecureToken(bytes = 32): string {
    return crypto.randomBytes(bytes).toString('base64url');
  }

  /** One-way hash of a raw token before storing it (in Redis) — mirrors how we treat passwords: never store the raw secret. */
  hashToken(rawToken: string): string {
    return crypto.createHash('sha256').update(rawToken).digest('hex');
  }
}
