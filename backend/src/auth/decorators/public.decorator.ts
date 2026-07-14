import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Marks a route as not requiring authentication. The global JwtAuthGuard
 * checks for this and skips token validation. Used for login, register,
 * OAuth callbacks, password reset, email verification, etc.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
