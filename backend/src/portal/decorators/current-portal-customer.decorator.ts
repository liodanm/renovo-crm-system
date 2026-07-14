import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthenticatedPortalCustomer } from '../interfaces/portal-token.interface';

export const CurrentPortalCustomer = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedPortalCustomer => {
    return ctx.switchToHttp().getRequest().portalCustomer;
  },
);
