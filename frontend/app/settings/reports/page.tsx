'use client';

import Link from 'next/link';
import { BarChart3, ChevronRight } from 'lucide-react';
import { SettingsSectionShell } from '../../../components/settings/SettingsSectionShell';

interface ReportLink {
  label: string;
  href: string;
  description: string;
}

interface ReportCategory {
  title: string;
  description: string;
  reports: ReportLink[];
  /** Reports named in this category's spec that don't exist yet — shown
   * as visibly inert, matching the same comingSoon convention already
   * used throughout Settings, never a fake clickable link. */
  comingSoon?: string[];
}

// Every href here was traced directly against frontend/app/reports/ —
// nothing assumed. AR & Cash, Technician Performance, and Route & Job
// Efficiency were part of the original 12-report plan but were never
// actually built (the phased rollout stopped after Customer Reporting),
// so they're honestly listed as not-yet-built rather than linked.
const categories: ReportCategory[] = [
  {
    title: 'Sales & Revenue',
    description: 'Estimates, sales, revenue, and collections.',
    reports: [
      { label: 'Owner Scorecard', href: '/reports', description: 'The 10 KPIs that matter most, at a glance' },
      { label: 'Revenue & Sales', href: '/reports/revenue', description: 'Collected, invoiced, and accepted-estimate revenue by service, technician, customer, and lead source' },
      { label: 'Estimate Conversion', href: '/reports/estimate-conversion', description: 'Win rate, lost value, and average time to acceptance' },
      { label: 'Average Ticket', href: '/reports/average-ticket', description: 'Completed-job revenue ÷ completed jobs, by service and technician' },
      { label: 'All Reports (Detailed Dashboard)', href: '/reports/all', description: 'The original combined revenue, estimate, and job trend dashboard' },
    ],
    comingSoon: ['Accounts Receivable & Cash'],
  },
  {
    title: 'Service & Profitability',
    description: 'What each job and service actually costs, and what it actually earns.',
    reports: [
      { label: 'Job Cost & Gross Margin', href: '/reports/job-cost', description: 'Real actual cost vs. revenue, job by job' },
      { label: 'Service Profitability', href: '/reports/service-profitability', description: 'Which services generate the most gross profit' },
    ],
  },
  {
    title: 'Customers',
    description: 'Who your best customers are, and whether they come back.',
    reports: [
      { label: 'Customer Lifetime Value', href: '/reports/customer-lifetime-value', description: 'Lifetime collected revenue by customer' },
      { label: 'Repeat & Recurring Customers', href: '/reports/repeat-customers', description: 'Repeat rate and recurring-service interest' },
      { label: 'Satisfaction & Callbacks', href: '/reports/satisfaction', description: 'Ratings, reviews, and callback rate' },
    ],
  },
  {
    title: 'Operations',
    description: 'Crew productivity and job scheduling efficiency.',
    reports: [],
    comingSoon: ['Technician Performance', 'Route & Job Efficiency'],
  },
];

export default function SettingsReportsPage() {
  return (
    <SettingsSectionShell
      backHref="/settings"
      title="Reports"
      description="Every report Renovo generates, organized in one place."
      hasUnsavedChanges={false}
      isSaving={false}
      error={null}
      onSave={() => undefined}
      onCancel={() => undefined}
    >
      <div className="space-y-6">
        {categories.map((category) => (
          <div key={category.title} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{category.title}</h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{category.description}</p>

            <div className="mt-3 divide-y divide-slate-100 dark:divide-slate-800">
              {category.reports.map((report) => (
                <Link
                  key={report.href}
                  href={report.href}
                  className="flex items-center gap-3 py-3 first:pt-0 last:pb-0 hover:bg-slate-50 dark:hover:bg-slate-800/50 -mx-1 px-1 rounded-lg"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--color-brand)]/[0.08]">
                    <BarChart3 className="h-4 w-4 text-[var(--color-brand)]" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-slate-900 dark:text-slate-100">{report.label}</span>
                    <span className="block truncate text-xs text-slate-500 dark:text-slate-400">{report.description}</span>
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-slate-300 dark:text-slate-600" />
                </Link>
              ))}

              {category.comingSoon?.map((label) => (
                <div key={label} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0 opacity-50">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800">
                    <BarChart3 className="h-4 w-4 text-slate-400" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-slate-500 dark:text-slate-400">{label}</span>
                    <span className="block text-xs text-slate-400 dark:text-slate-500">Not built yet</span>
                  </span>
                  <span className="shrink-0 rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[10px] font-medium text-slate-500 dark:text-slate-400">Soon</span>
                </div>
              ))}

              {category.reports.length === 0 && !category.comingSoon?.length && (
                <p className="py-3 text-xs text-slate-400 dark:text-slate-500">Nothing here yet.</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </SettingsSectionShell>
  );
}
