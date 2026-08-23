import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard,
  Users,
  FileText,
  Briefcase,
  Calendar,
  Receipt,
  CreditCard,
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
      { label: 'Marketing', href: '/marketing', icon: Megaphone, comingSoon: true },
    ],
  },
  {
    label: 'Reports',
    items: [
      { label: 'Owner Scorecard', href: '/reports', icon: BarChart3 },
      { label: 'Revenue & Sales', href: '/reports/revenue', icon: BarChart3 },
      { label: 'Estimate Conversion', href: '/reports/estimate-conversion', icon: BarChart3 },
      { label: 'Average Ticket', href: '/reports/average-ticket', icon: BarChart3 },
      { label: 'Service Profitability', href: '/reports/service-profitability', icon: BarChart3 },
      { label: 'Job Cost & Margin', href: '/reports/job-cost', icon: BarChart3 },
    ],
  },
  {
    label: 'Operations',
    items: [
      { label: 'Service Catalog', href: '/service-catalog', icon: BookOpen },
      { label: 'Settings', href: '/settings', icon: Settings },
      { label: 'Support', href: '/support', icon: LifeBuoy, comingSoon: true },
    ],
  },
];

// Deliberately kept as its own export (rather than removed) — both
// Sidebar and MobileSidebar import and render it, and an empty array is
// a safe, valid state for them (renders nothing, no layout gap). Every
// item that used to live here (Settings, then Support) has since moved
// into the Operations group above. If a genuinely global, ungrouped
// utility item is ever needed again, it has a home to go back to
// without touching either sidebar component.
export const utilityNavItems: NavItem[] = [];
