import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/** Applied only to POST /auth/refresh — validates the refresh token, not the access token. */
@Injectable()
export class JwtRefreshGuard extends AuthGuard('jwt-refresh') {}
