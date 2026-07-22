export interface SettingsNavItem {
  key: string;
  label: string;
  description: string;
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
      { key: 'profile', label: 'Profile', description: 'Your name, contact info, and personal preferences' },
    ],
  },
  {
    label: 'Business',
    items: [
      { key: 'company', label: 'Company', description: 'Business identity, contact info, and hours' },
      { key: 'business-defaults', label: 'Business Defaults', description: 'Defaults used across Estimates, Jobs, and Scheduling' },
      { key: 'branding', label: 'Branding', description: 'Colors and messaging on estimates and invoices' },
    ],
  },
  {
    label: 'Money',
    items: [
      { key: 'payments', label: 'Payments', description: 'Payment methods and Stripe status' },
      { key: 'api-keys', label: 'API Keys', description: 'Programmatic access to your account', comingSoon: true },
    ],
  },
  {
    label: 'Communication',
    items: [
      { key: 'email', label: 'Email', description: 'Postmark status, sender identity, test email' },
      { key: 'sms', label: 'SMS', description: 'Twilio status, test message' },
      { key: 'storage', label: 'Storage', description: 'File storage status and upload limits' },
    ],
  },
  {
    label: 'Operations',
    items: [
      { key: 'service-catalog', label: 'Service Catalog', description: 'Predefined services with pricing and defaults', externalHref: '/service-catalog' },
      { key: 'chemical-inventory', label: 'Chemical Inventory', description: 'Track chemical stock and usage', comingSoon: true },
      { key: 'equipment-inventory', label: 'Equipment Inventory', description: 'Track equipment and maintenance', comingSoon: true },
      { key: 'automation', label: 'Automation', description: 'Automated follow-ups and reminders' },
    ],
  },
  {
    label: 'Team & Access',
    items: [
      { key: 'users-roles', label: 'Users & Roles', description: 'Team members and permissions', comingSoon: true },
      { key: 'security', label: 'Security', description: 'Two-factor auth and session management', comingSoon: true },
    ],
  },
  {
    label: 'Platform',
    items: [
      { key: 'notifications', label: 'Notifications', description: 'Email and SMS notification preferences', comingSoon: true },
      { key: 'integrations', label: 'Integrations', description: 'Provider status, system health, and business links' },
      { key: 'reports', label: 'Reports', description: 'Custom reports and dashboards', comingSoon: true },
      { key: 'appearance', label: 'Appearance', description: 'App theme and display preferences', comingSoon: true },
    ],
  },
  {
    label: 'Support',
    items: [
      { key: 'backups', label: 'Backups', description: 'Data export and backup schedule', comingSoon: true },
      { key: 'help-support', label: 'Help & Support', description: 'Documentation and contact support', comingSoon: true },
      { key: 'about', label: 'About', description: 'Version info and legal', comingSoon: true },
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
