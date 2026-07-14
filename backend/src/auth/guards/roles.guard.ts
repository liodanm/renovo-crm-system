import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY, RenovoRole } from '../decorators/roles.decorator';
import { AuthenticatedRequestUser } from '../interfaces/jwt-payload.interface';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<RenovoRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true; // route has no @Roles() restriction
    }

    const user: AuthenticatedRequestUser = context.switchToHttp().getRequest().user;
    if (!user) {
      throw new ForbiddenException('Not authenticated');
    }

    const allowed = requiredRoles.includes(user.roleName as RenovoRole);
    if (!allowed) {
      throw new ForbiddenException(
        `This action requires one of the following roles: ${requiredRoles.join(', ')}`,
      );
    }

    return true;
  }
}
