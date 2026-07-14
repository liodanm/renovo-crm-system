import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';

export type RenovoRole = 'owner' | 'admin' | 'dispatcher' | 'crew_lead' | 'crew_member' | 'billing';

/**
 * Restricts a route to specific role names.
 * Example: @Roles('owner', 'admin')
 *
 * Prefer @RequirePermissions() for most business logic — role checks are
 * coarse and brittle (adding a 7th role means auditing every @Roles() call).
 * Reach for @Roles() only for structural actions tightly bound to a role's
 * identity, like "only an owner can delete the company" or "only owner/admin
 * can manage billing".
 */
export const Roles = (...roles: RenovoRole[]) => SetMetadata(ROLES_KEY, roles);
