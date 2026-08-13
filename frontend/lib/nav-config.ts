import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard,
  Users,
  FileText,
  Briefcase,
  Calendar,
  Receipt,
  CreditCard,
  RefreshCw,
  Megaphone,
  BarChart3,
  Settings,
  LifeBuoy,
  BookOpen,
} from 'lucide-react';

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Shown as a small badge (e.g. a count) — wired up later per item, not required today. */
  badgeKey?: string;
  /** Marks an item that doesn't exist yet — renders visible but inert, so the
   * information architecture is real and navigable-by-eye today, without
   * shipping dead links. Remove this flag the day the page ships. */
  comingSoon?: boolean;
}

export interface NavGroup {
  /** Omit for the top, ungrouped "daily workflow" items — a label there
   * would just be noise above the single most-used items in the app. */
  label?: string;
  items: NavItem[];
}

// Order follows the actual pressure-washing workflow end to end: a lead
// becomes a customer, a customer has properties, a property gets an
// estimate, an accepted estimate becomes a job, a job gets scheduled,
// completed work gets invoiced, an invoice gets paid. Reading top to
// bottom is reading the business's real pipeline — that's the actual
// design rationale, not alphabetical or arbitrary.
export const navGroups: NavGroup[] = [
  {
    items: [
      { label: 'Dashboard', href: '/', icon: LayoutDashboard },
      { label: 'Customers', href: '/customers', icon: Users },
      { label: 'Estimates', href: '/estimates', icon: FileText },
      { label: 'Jobs', href: '/jobs', icon: Briefcase },
      { label: 'Schedule', href: '/scheduling', icon: Calendar },
    ],
  },
  {
    label: 'Money',
    items: [
      { label: 'Invoices', href: '/invoices', icon: Receipt },
      { label: 'Payments', href: '/payments', icon: CreditCard },
    ],
  },
  {
    label: 'Growth',
    items: [
      { label: 'Recurring Services', href: '/recurring-services', icon: RefreshCw, comingSoon: true },
      { label: 'Marketing', href: '/marketing', icon: Megaphone, comingSoon: true },
    ],
  },
  {
    label: 'Operations',
    items: [
      { label: 'Service Catalog', href: '/service-catalog', icon: BookOpen },
      { label: 'Reports', href: '/reports', icon: BarChart3 },
      { label: 'Settings', href: '/settings', icon: Settings },
    ],
  },
];

// Deliberately separate from navGroups — sits pinned below the
// scrollable nav, above the user profile block, never grouped under a
// workflow label, since it's not part of the day's work. Settings moved
// into the Operations group above (right after Reports) — Support is
// the only item left here now.
export const utilityNavItems: NavItem[] = [
  { label: 'Support', href: '/support', icon: LifeBuoy, comingSoon: true },
];
