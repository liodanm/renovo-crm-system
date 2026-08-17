import type { LucideIcon } from 'lucide-react';
import {
  User,
  Building2,
  Sliders,
  Palette,
  TrendingUp,
  Star,
  FileText,
  Upload,
  CreditCard,
  Key,
  Mail,
  MessageSquare,
  HardDrive,
  Wrench,
  FlaskConical,
  Truck,
  Zap,
  Users,
  Shield,
  Bell,
  Link as LinkIcon,
  BarChart3,
  Moon,
  Database,
  HelpCircle,
  Info,
} from 'lucide-react';

export interface SettingsNavItem {
  key: string;
  label: string;
  description: string;
  /** Icon shown on the Settings landing page's category cards. Optional —
   * falls back to a generic icon if unset, so this never blocks adding a
   * new settings item. */
  icon?: LucideIcon;
  /** If set, the nav item links here instead of a settings sub-route —
   * used for Service Catalog, which already has a full, real page of
   * its own. Linking out avoids a second, redundant "Service Catalog"
   * screen living inside Settings. */
  externalHref?: string;
  comingSoon?: boolean;
}

export interface SettingsNavGroup {
  label: string;
  items: SettingsNavItem[];
}

export const settingsNavGroups: SettingsNavGroup[] = [
  {
    label: 'Account',
    items: [
      { key: 'profile', label: 'Profile', description: 'Your name, contact info, and personal preferences', icon: User },
    ],
  },
  {
    label: 'Business',
    items: [
      { key: 'company', label: 'Company', description: 'Business identity, contact info, and hours', icon: Building2 },
      { key: 'business-defaults', label: 'Business Defaults', description: 'Defaults used across Estimates, Jobs, and Scheduling', icon: Sliders },
      { key: 'branding', label: 'Branding', description: 'Colors and messaging on estimates and invoices', icon: Palette },
      { key: 'lead-sources', label: 'Lead Sources', description: 'How customers find you — shown as a dropdown on every customer', icon: TrendingUp },
      { key: 'estimates', label: 'Estimate Settings', description: 'Tax, expiration, and package discount defaults for new estimates', icon: FileText },
      { key: 'import-export', label: 'Import / Export', description: 'Import customers from CSV, or export your current list', icon: Upload },
      { key: 'google-reviews', label: 'Google Reviews', description: 'Show your Google reviews on the Dashboard', icon: Star },
    ],
  },
  {
    label: 'Money',
    items: [
      { key: 'payments', label: 'Payments', description: 'Payment methods and Stripe status', icon: CreditCard },
      { key: 'api-keys', label: 'API Keys', description: 'Programmatic access to your account', comingSoon: true, icon: Key },
    ],
  },
  {
    label: 'Communication',
    items: [
      { key: 'email', label: 'Email', description: 'Postmark status, sender identity, test email', icon: Mail },
      { key: 'sms', label: 'SMS', description: 'Twilio status, test message', icon: MessageSquare },
      { key: 'storage', label: 'Storage', description: 'File storage status and upload limits', icon: HardDrive },
    ],
  },
  {
    label: 'Operations',
    items: [
      { key: 'service-catalog', label: 'Service Catalog', description: 'Predefined services with pricing and defaults', externalHref: '/service-catalog', icon: Wrench },
      { key: 'chemical-inventory', label: 'Chemical Inventory', description: 'Track chemical stock and usage', comingSoon: true, icon: FlaskConical },
      { key: 'equipment-inventory', label: 'Equipment Inventory', description: 'Track equipment and maintenance', comingSoon: true, icon: Truck },
      { key: 'automation', label: 'Automation', description: 'Automated follow-ups and reminders', icon: Zap },
    ],
  },
  {
    label: 'Team & Access',
    items: [
      { key: 'users-roles', label: 'Users & Roles', description: 'Team members and permissions', comingSoon: true, icon: Users },
      { key: 'security', label: 'Security', description: 'Two-factor auth and session management', comingSoon: true, icon: Shield },
    ],
  },
  {
    label: 'Platform',
    items: [
      { key: 'notifications', label: 'Notifications', description: 'Email and SMS notification preferences', comingSoon: true, icon: Bell },
      { key: 'integrations', label: 'Integrations', description: 'Provider status, system health, and business links', icon: LinkIcon },
      { key: 'reports', label: 'Reports', description: 'Custom reports and dashboards', comingSoon: true, icon: BarChart3 },
      { key: 'appearance', label: 'Appearance', description: 'App theme and display preferences', icon: Moon },
    ],
  },
  {
    label: 'Support',
    items: [
      { key: 'backups', label: 'Backups', description: 'Data export and backup schedule', comingSoon: true, icon: Database },
      { key: 'help-support', label: 'Help & Support', description: 'Documentation and contact support', comingSoon: true, icon: HelpCircle },
      { key: 'about', label: 'About', description: 'Version info and legal', comingSoon: true, icon: Info },
    ],
  },
];

export function findSettingsNavItem(key: string): SettingsNavItem | undefined {
  for (const group of settingsNavGroups) {
    const found = group.items.find((i) => i.key === key);
    if (found) return found;
  }
  return undefined;
}
