import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard,
  UserPlus,
  Users,
  MapPin,
  FileText,
  Briefcase,
  Calendar,
  Receipt,
  CreditCard,
  Star,
  RefreshCw,
  Megaphone,
  Zap,
  Boxes,
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
      { label: 'Leads', href: '/leads', icon: UserPlus, comingSoon: true },
      { label: 'Customers', href: '/customers', icon: Users },
      { label: 'Properties', href: '/properties', icon: MapPin, comingSoon: true },
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
      { label: 'Reviews', href: '/reviews', icon: Star, comingSoon: true },
      { label: 'Marketing', href: '/marketing', icon: Megaphone, comingSoon: true },
    ],
  },
  {
    label: 'Operations',
    items: [
      { label: 'Automation', href: '/automation', icon: Zap, comingSoon: true },
      { label: 'Service Catalog', href: '/service-catalog', icon: BookOpen },
      { label: 'Assets', href: '/assets', icon: Boxes, comingSoon: true },
      { label: 'Reports', href: '/reports', icon: BarChart3 },
    ],
  },
];

// Deliberately separate from navGroups — these sit pinned below the
// scrollable nav, above the user profile block, and never get grouped
// under a workflow label, since they're not part of the day's work.
export const utilityNavItems: NavItem[] = [
  { label: 'Settings', href: '/settings', icon: Settings },
  { label: 'Support', href: '/support', icon: LifeBuoy, comingSoon: true },
];
