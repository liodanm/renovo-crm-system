import type { LucideIcon } from 'lucide-react';
import { FileText, Calendar, DollarSign, User } from 'lucide-react';

export interface PortalNavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

// Order matches Quotes → Appointments → Invoices → Account — the order
// a customer naturally moves through: see what's been quoted, see
// what's scheduled, see what's owed, manage their own info.
export const portalNavItems: PortalNavItem[] = [
  { label: 'Quotes', href: '/portal/dashboard', icon: FileText },
  { label: 'Appointments', href: '/portal/appointments', icon: Calendar },
  { label: 'Invoices', href: '/portal/invoices', icon: DollarSign },
  { label: 'Account', href: '/portal/account', icon: User },
];
