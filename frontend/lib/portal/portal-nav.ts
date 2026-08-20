import type { LucideIcon } from 'lucide-react';
import { FileText, Calendar, DollarSign, User, Plus } from 'lucide-react';

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

// Kept as its own array, not folded into portalNavItems above — this
// is an action (jumps into a form), not a section of the portal the
// way the other four are, but the mobile tab bar reference this shell
// is matching shows it as a fifth persistent tab, so it's rendered
// alongside the others there specifically.
export const portalRequestQuoteItem: PortalNavItem = { label: 'Request', href: '/portal/request-quote', icon: Plus };
