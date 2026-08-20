'use client';

import { Fragment, useState } from 'react';
import useSWR from 'swr';
import { ShieldAlert, ShieldCheck } from 'lucide-react';
import { SettingsSectionShell } from '../../../components/settings/SettingsSectionShell';
import { securityEventsApi, SECURITY_EVENT_LABELS, type SecurityEventType } from '../../../lib/api/security-events';
import { resolvePreset, DATE_PRESETS, type DatePreset } from '../../../lib/api/reports';
import { cn } from '../../../lib/utils';

const EVENT_TYPE_GROUPS: { label: string; types: SecurityEventType[] }[] = [
  { label: 'Login', types: ['login_success', 'login_failure'] },
  { label: 'Lockout', types: ['account_locked'] },
  { label: 'Registration', types: ['registration_success', 'registration_duplicate_attempt'] },
  { label: 'Password', types: ['password_reset_request', 'password_reset_completed'] },
  { label: 'Staff Access', types: ['invitation_sent', 'invitation_accepted'] },
];

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export default function SecurityActivityPage() {
  const [preset, setPreset] = useState<DatePreset>('This Month');
  const { start, end } = resolvePreset(preset);
  const startIso = start.toISOString();
  const endIso = end.toISOString();

  const [eventTypeFilter, setEventTypeFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'' | 'true' | 'false'>('');
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data: summary } = useSWR(['security-summary', startIso, endIso], () => securityEventsApi.summary(startIso, endIso));
  const { data: suspicious } = useSWR('security-suspicious', () => securityEventsApi.suspicious());
  const { data: eventsPage, error, isLoading } = useSWR(
    ['security-events', startIso, endIso, eventTypeFilter, statusFilter, page],
    () =>
      securityEventsApi.list({
        start: startIso,
        end: endIso,
        eventType: eventTypeFilter || undefined,
        success: statusFilter || undefined,
        page,
        pageSize: 25,
      }),
  );

  const totalPages = eventsPage ? Math.max(1, Math.ceil(eventsPage.total / eventsPage.pageSize)) : 1;

  return (
    <SettingsSectionShell
      backHref="/settings"
      title="Security Activity"
      description="Logins, lockouts, registrations, and staff access changes for your company — without needing to check server logs."
      hasUnsavedChanges={false}
      isSaving={false}
      error={null}
      onSave={() => undefined}
      onCancel={() => undefined}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1 rounded-lg bg-slate-100 dark:bg-slate-800 p-1">
          {DATE_PRESETS.filter((p) => p !== 'Custom').map((p) => (
            <button
              key={p}
              onClick={() => { setPreset(p); setPage(1); }}
              className={cn('rounded-md px-2.5 py-1.5 text-xs font-medium', preset === p ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm' : 'text-slate-500 dark:text-slate-400')}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* Summary KPIs — all backend-computed, never calculated client-side. */}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
        <SummaryCard label="Successful Logins" value={summary?.successfulLogins} tone="good" />
        <SummaryCard label="Failed Login Attempts" value={summary?.failedLoginAttempts} tone={summary && summary.failedLoginAttempts > 0 ? 'warning' : undefined} />
        <SummaryCard label="Account Lockouts" value={summary?.accountLockouts} tone={summary && summary.accountLockouts > 0 ? 'danger' : undefined} />
        <SummaryCard label="New Registrations" value={summary?.newRegistrations} />
        <SummaryCard label="Staff Access Changes" value={summary?.staffAccessChanges} />
      </div>

      {/* Simple, deterministic suspicious-activity indicator — see the
          backend's own comment for why this is the one rule
          implemented, not an inferred risk score. */}
      {suspicious && suspicious.repeatedFailedLoginIdentifiers.length > 0 && (
        <div className="mt-4 flex items-start gap-2 rounded-lg border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            3 or more failed login attempts in the last hour for:{' '}
            <strong>{suspicious.repeatedFailedLoginIdentifiers.join(', ')}</strong>. If this wasn&apos;t you or your team, consider this a warning sign.
          </span>
        </div>
      )}
      {suspicious && suspicious.repeatedFailedLoginIdentifiers.length === 0 && (
        <div className="mt-4 flex items-center gap-2 rounded-lg bg-slate-50 dark:bg-slate-800 px-4 py-2.5 text-sm text-slate-500 dark:text-slate-400">
          <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-500" />
          No repeated failed login attempts in the last hour.
        </div>
      )}

      {/* Filters */}
      <div className="mt-4 flex flex-wrap gap-2">
        <select
          value={eventTypeFilter}
          onChange={(e) => { setEventTypeFilter(e.target.value); setPage(1); }}
          className="rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-xs dark:bg-slate-900 dark:text-slate-100"
        >
          <option value="">All event types</option>
          {EVENT_TYPE_GROUPS.map((group) => (
            <optgroup key={group.label} label={group.label}>
              {group.types.map((t) => (
                <option key={t} value={t}>{SECURITY_EVENT_LABELS[t]}</option>
              ))}
            </optgroup>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value as '' | 'true' | 'false'); setPage(1); }}
          className="rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-xs dark:bg-slate-900 dark:text-slate-100"
        >
          <option value="">All statuses</option>
          <option value="true">Successful</option>
          <option value="false">Failed</option>
        </select>
      </div>

      {/* Table */}
      <div className="mt-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
        {isLoading && <div className="h-40 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />}
        {error && !isLoading && <p className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">We couldn&apos;t load security activity right now. Please try refreshing.</p>}
        {!isLoading && !error && eventsPage?.events.length === 0 && (
          <p className="py-8 text-center text-sm text-slate-400 dark:text-slate-500">No security activity in this date range.</p>
        )}
        {!isLoading && !error && eventsPage && eventsPage.events.length > 0 && (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-slate-400 dark:text-slate-500">
                  <tr>
                    <th className="pb-1.5 text-left font-medium">Date</th>
                    <th className="pb-1.5 text-left font-medium">Event</th>
                    <th className="pb-1.5 text-left font-medium">Account</th>
                    <th className="pb-1.5 text-left font-medium">Status</th>
                    <th className="pb-1.5 text-left font-medium">IP</th>
                    <th className="pb-1.5 text-left font-medium">Device</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {eventsPage.events.map((e) => (
                    <Fragment key={e.id}>
                      <tr
                        onClick={() => setExpandedId(expandedId === e.id ? null : e.id)}
                        className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50"
                      >
                        <td className="py-1.5 text-slate-500 dark:text-slate-400">{formatDate(e.createdAt)}</td>
                        <td className="py-1.5 font-medium text-slate-900 dark:text-slate-100">{SECURITY_EVENT_LABELS[e.eventType]}</td>
                        <td className="py-1.5 text-slate-700 dark:text-slate-300">{e.userName ?? e.identifierMasked ?? '—'}</td>
                        <td className="py-1.5">
                          <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium', e.success ? 'bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300' : 'bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300')}>
                            {e.success ? 'Successful' : 'Failed'}
                          </span>
                        </td>
                        <td className="py-1.5 text-slate-500 dark:text-slate-400">{e.ipAddress ?? '—'}</td>
                        <td className="py-1.5 text-slate-500 dark:text-slate-400">{e.userAgent ? e.userAgent.slice(0, 40) : '—'}</td>
                      </tr>
                      {expandedId === e.id && (
                        <tr className="bg-slate-50 dark:bg-slate-800/50">
                          <td colSpan={6} className="px-2 py-3">
                            <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-[11px] sm:grid-cols-4">
                              <div><dt className="text-slate-400 dark:text-slate-500">Reason</dt><dd className="text-slate-700 dark:text-slate-300">{e.reason ?? '—'}</dd></div>
                              <div><dt className="text-slate-400 dark:text-slate-500">Full device</dt><dd className="text-slate-700 dark:text-slate-300">{e.userAgent ?? '—'}</dd></div>
                              {e.metadata && Object.entries(e.metadata).map(([k, v]) => (
                                <div key={k}><dt className="text-slate-400 dark:text-slate-500">{k}</dt><dd className="text-slate-700 dark:text-slate-300">{String(v)}</dd></div>
                              ))}
                            </dl>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="mt-3 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                <span>Page {eventsPage.page} of {totalPages} — {eventsPage.total} events</span>
                <div className="flex gap-1">
                  <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded border border-slate-200 dark:border-slate-700 px-2 py-1 disabled:opacity-40">Previous</button>
                  <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="rounded border border-slate-200 dark:border-slate-700 px-2 py-1 disabled:opacity-40">Next</button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </SettingsSectionShell>
  );
}

function SummaryCard({ label, value, tone }: { label: string; value: number | undefined; tone?: 'good' | 'warning' | 'danger' }) {
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3">
      <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</p>
      <p className={cn(
        'mt-1 text-lg font-semibold',
        tone === 'good' ? 'text-emerald-600 dark:text-emerald-400' : tone === 'warning' ? 'text-amber-600 dark:text-amber-400' : tone === 'danger' ? 'text-red-600 dark:text-red-400' : 'text-slate-900 dark:text-slate-100',
      )}>
        {value ?? '—'}
      </p>
    </div>
  );
}
