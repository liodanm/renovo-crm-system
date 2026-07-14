import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthenticatedRequestUser } from '../interfaces/jwt-payload.interface';

/**
 * Pulls the authenticated user (as attached by JwtAccessStrategy) out of
 * the request. Usage: `@CurrentUser() user: AuthenticatedRequestUser`
 * or a single field: `@CurrentUser('companyId') companyId: string`
 */
export const CurrentUser = createParamDecorator(
  (field: keyof AuthenticatedRequestUser | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user: AuthenticatedRequestUser = request.user;
    return field ? user?.[field] : user;
  },
);
