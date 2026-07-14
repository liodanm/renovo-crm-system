'use client';

import { ReactNode } from 'react';
import { useAuth } from '../../lib/auth/auth-context';

interface PermissionGateProps {
  children: ReactNode;
  /** Require ALL of these permissions */
  permissions?: string[];
  /** Require ANY of these permissions (OR) */
  anyPermission?: string[];
  /** Require the user to hold one of these roles */
  roles?: string[];
  fallback?: ReactNode;
}

/**
 * Client-side gating for UI affordances only — e.g. hiding a "Delete job"
 * button from a crew_member. This is a UX convenience, NOT a security
 * boundary: the backend's PermissionsGuard/RolesGuard are what actually
 * enforce access, since a user can always bypass client-side JS.
 *
 * Usage:
 *   <PermissionGate permissions={['invoices.write']}>
 *     <SendInvoiceButton />
 *   </PermissionGate>
 */
export function PermissionGate({ children, permissions, anyPermission, roles, fallback = null }: PermissionGateProps) {
  const { hasPermission, hasAnyPermission, hasRole, isLoading } = useAuth();

  if (isLoading) return null;

  if (permissions && !permissions.every((p) => hasPermission(p))) return <>{fallback}</>;
  if (anyPermission && !hasAnyPermission(anyPermission)) return <>{fallback}</>;
  if (roles && !hasRole(...roles)) return <>{fallback}</>;

  return <>{children}</>;
}
