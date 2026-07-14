import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'permissions';

/**
 * Restricts a route to callers holding ALL of the given permission keys
 * (see the `permissions` table — 'invoices.write', 'jobs.delete', etc).
 * This is the primary, fine-grained authorization mechanism; roles are
 * just named bundles of these permissions.
 *
 * Example: @RequirePermissions('invoices.write', 'payments.write')
 */
export const RequirePermissions = (...permissions: string[]) => SetMetadata(PERMISSIONS_KEY, permissions);
