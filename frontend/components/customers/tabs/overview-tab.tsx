'use client';

import { useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { CalendarClock, ChevronRight } from 'lucide-react';
import { customersApi, CustomerProfile, ServiceHistory } from '../../../lib/api/customers';
import { CardSkeleton } from '../../dashboard/dashboard-card';
import { cn } from '../../../lib/utils';

function formatMoney(value: string | number): string {
  return `$${Number(value).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}
function timeAgo(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/**
 * Two-column Overview. Deliberately takes `serviceHistory` as a prop
 * from the parent page rather than fetching it again here — the parent
 * already loads it (same SWR key every other tab shares), and Next
 * Action / Recent Activity / Upcoming / Recent Estimates & Jobs are all
 * derived from that single response, not four separate requests.
 * customer.properties and customer.customFields are likewise already
 * embedded on the CustomerProfile the parent fetched — no separate
 * listProperties()/getCustomFieldValues() call needed for this compact
 * view (PropertiesTab still owns the full, editable property list).
 */
export function OverviewTab({
  customer,
  serviceHistory,
  onUpdated,
  onNavigateTab,
}: {
  customer: CustomerProfile;
  serviceHistory: ServiceHistory | undefined;
  onUpdated: () => void;
  onNavigateTab: (tab: 'Properties' | 'Activity') => void;
}) {
  const [isEditingTags, setIsEditingTags] = useState(false);
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState(customer.tags);
  const [savingTags, setSavingTags] = useState(false);

  // Recent Activity reuses the exact same endpoint the Activity tab
  // itself calls — not a second activity system, just a shorter slice
  // of the same data shown here.
  const { data: activity } = useSWR([`activity`, customer.id], () => customersApi.getActivity(customer.id));

  async function saveTags(nextTags: string[]) {
    setSavingTags(true);
    try {
      await customersApi.update(customer.id, { tags: nextTags });
      setTags(nextTags);
      onUpdated();
    } finally {
      setSavingTags(false);
    }
  }
  function addTag() {
    const value = tagInput.trim();
    if (value && !tags.includes(value)) saveTags([...tags, value]);
    setTagInput('');
  }
  function removeTag(tag: string) {
    saveTags(tags.filter((t) => t !== tag));
  }

  // Deterministic, existing-data rules only — no invented scoring, no
  // speculative recommendation. Checked in priority order; the first
  // rule that matches wins.
  const nextAction = (() => {
    if (!serviceHistory) return null;
    const followUpEstimate = [...serviceHistory.estimates].filter((e) => e.status === 'sent' || e.status === 'viewed')
      .sort((a, b) => new Date(b.sentAt ?? b.createdAt).getTime() - new Date(a.sentAt ?? a.createdAt).getTime())[0];
    if (followUpEstimate) {
      return {
        title: 'Follow up on estimate',
        detail: `${formatMoney(followUpEstimate.totalAmount)} • Sent ${timeAgo(followUpEstimate.sentAt ?? followUpEstimate.createdAt)}`,
        cta: 'Follow Up',
        href: `/estimates/${followUpEstimate.id}`,
      };
    }
    const needsScheduling = serviceHistory.jobs.find((j) => (j.status === 'draft' || j.status === 'scheduled') && !j.scheduledStart);
    if (needsScheduling) {
      return { title: 'Schedule the customer\u2019s job', detail: needsScheduling.title, cta: 'Schedule Job', href: '/scheduling' };
    }
    const upcoming = [...serviceHistory.jobs]
      .filter((j) => j.scheduledStart && new Date(j.scheduledStart) > new Date() && j.status === 'scheduled')
      .sort((a, b) => new Date(a.scheduledStart!).getTime() - new Date(b.scheduledStart!).getTime())[0];
    if (upcoming) {
      return {
        title: 'Upcoming service appointment',
        detail: `${upcoming.title} • ${new Date(upcoming.scheduledStart!).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
        cta: 'View Job',
        href: `/jobs/${upcoming.id}`,
      };
    }
    return null;
  })();

  const upcomingJob = serviceHistory
    ? [...serviceHistory.jobs].filter((j) => j.scheduledStart && new Date(j.scheduledStart) > new Date()).sort((a, b) => new Date(a.scheduledStart!).getTime() - new Date(b.scheduledStart!).getTime())[0]
    : undefined;

  const recentEstimates = serviceHistory ? [...serviceHistory.estimates].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 3) : [];
  const recentJobs = serviceHistory ? [...serviceHistory.jobs].sort((a, b) => new Date(b.scheduledStart ?? 0).getTime() - new Date(a.scheduledStart ?? 0).getTime()).slice(0, 3) : [];

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[65%_1fr]">
      {/* ---- LEFT: Next Action, Recent Activity, Upcoming, Recent Estimates/Jobs ---- */}
      <div className="space-y-4">
        <Section title="Next Action">
          {!serviceHistory && <CardSkeleton lines={2} />}
          {serviceHistory && !nextAction && <p className="text-sm text-slate-400 dark:text-slate-500">No immediate action needed.</p>}
          {nextAction && (
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{nextAction.title}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">{nextAction.detail}</p>
              </div>
              <Link href={nextAction.href} className="shrink-0 rounded-lg bg-[var(--color-brand)] px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90">
                {nextAction.cta}
              </Link>
            </div>
          )}
        </Section>

        <Section title="Recent Activity" action={<button onClick={() => onNavigateTab('Activity')} className="text-xs text-[var(--color-brand)] hover:underline">View All Activity</button>}>
          {!activity && <CardSkeleton lines={3} />}
          {activity && activity.length === 0 && <p className="text-sm text-slate-400 dark:text-slate-500">No activity recorded yet.</p>}
          {activity && activity.length > 0 && (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {activity.slice(0, 5).map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-3 py-2 text-sm first:pt-0 last:pb-0">
                  <span className="text-slate-700 dark:text-slate-300">{e.description}</span>
                  <span className="shrink-0 text-xs text-slate-400 dark:text-slate-500">{timeAgo(e.occurredAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Upcoming">
          {!serviceHistory && <CardSkeleton lines={1} />}
          {serviceHistory && !upcomingJob && (
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-slate-400 dark:text-slate-500">No appointments scheduled.</p>
              <Link href={`/scheduling?customerId=${customer.id}`} className="shrink-0 rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800">
                + Schedule Appointment
              </Link>
            </div>
          )}
          {upcomingJob && (
            <Link href={`/jobs/${upcomingJob.id}`} className="flex items-center gap-3 text-sm hover:text-[var(--color-brand)]">
              <CalendarClock className="h-4 w-4 shrink-0 text-slate-400" />
              <span className="font-medium text-slate-800 dark:text-slate-100">{new Date(upcomingJob.scheduledStart!).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
              <span className="text-slate-600 dark:text-slate-400">{upcomingJob.title}</span>
              <span className="text-slate-400 dark:text-slate-500">{new Date(upcomingJob.scheduledStart!).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</span>
            </Link>
          )}
        </Section>

        {(recentEstimates.length > 0 || recentJobs.length > 0) && (
          <Section title="Recent Estimates & Jobs">
            <div className="space-y-1">
              {recentEstimates.map((e) => (
                <HistoryRow key={e.id} href={`/estimates/${e.id}`} left="Estimate" right={formatMoney(e.totalAmount)} status={e.status} date={e.sentAt ?? e.createdAt} />
              ))}
              {recentJobs.map((j) => (
                <HistoryRow key={j.id} href={`/jobs/${j.id}`} left={j.title} right={formatMoney(j.price)} status={j.status} date={j.scheduledStart} />
              ))}
            </div>
          </Section>
        )}
      </div>

      {/* ---- RIGHT: Customer Info, Property, Tags, Custom Fields ---- */}
      <div className="space-y-4">
        <Section title="Contact">
          <dl className="space-y-1.5 text-sm">
            <InfoRow label="Phone" value={customer.phone} href={customer.phone ? `tel:${customer.phone}` : undefined} />
            {customer.secondaryPhone && <InfoRow label="Secondary" value={customer.secondaryPhone} href={`tel:${customer.secondaryPhone}`} />}
            <InfoRow label="Email" value={customer.email} href={customer.email ? `mailto:${customer.email}` : undefined} />
          </dl>
        </Section>

        <Section title="Customer Details">
          <dl className="space-y-1.5 text-sm">
            <InfoRow label="Type" value={customer.customerType} capitalize />
            <InfoRow label="Lead Source" value={customer.source} />
            <InfoRow label="Lead Status" value={customer.leadStatus} capitalize />
          </dl>
        </Section>

        <Section title={customer.properties.length > 1 ? 'Properties' : 'Property'} action={customer.properties.length > 1 ? <button onClick={() => onNavigateTab('Properties')} className="text-xs text-[var(--color-brand)] hover:underline">View All</button> : undefined}>
          {customer.properties.length === 0 && <p className="text-sm text-slate-400 dark:text-slate-500">No properties yet.</p>}
          {customer.properties.length > 0 && (
            <div className="space-y-2">
              {customer.properties.slice(0, 3).map((p) => (
                <div key={p.id} className="text-sm">
                  <p className="font-medium text-slate-800 dark:text-slate-100">{p.addressLine1}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{p.city}, {p.state}{p.label ? ` • ${p.label}` : ''}</p>
                </div>
              ))}
            </div>
          )}
        </Section>

        <Section title="Tags">
          <div className="flex flex-wrap gap-1.5">
            {tags.map((tag) => (
              <span key={tag} className="flex items-center gap-1 rounded-full bg-slate-100 dark:bg-slate-800 px-2.5 py-1 text-xs text-slate-700 dark:text-slate-300">
                {tag}
                <button onClick={() => removeTag(tag)} disabled={savingTags} className="text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:text-slate-300">×</button>
              </span>
            ))}
            {isEditingTags ? (
              <input
                autoFocus
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }}
                onBlur={() => { addTag(); setIsEditingTags(false); }}
                placeholder="Add tag…"
                className="w-24 rounded-full border border-slate-300 dark:border-slate-700 px-2.5 py-1.5 text-base focus:border-[var(--color-brand)] focus:outline-none lg:py-1 lg:text-xs dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-400"
              />
            ) : (
              <button onClick={() => setIsEditingTags(true)} className="rounded-full border border-dashed border-slate-300 dark:border-slate-700 px-2.5 py-1 text-xs text-slate-500 dark:text-slate-400 hover:border-slate-400">
                + Add Tag
              </button>
            )}
          </div>
        </Section>

        <Section title="Custom Fields">
          {customer.customFields.length === 0 && (
            <p className="text-sm text-slate-400 dark:text-slate-500">No custom fields configured.</p>
          )}
          {customer.customFields.length > 0 && (
            <dl className="space-y-1.5 text-sm">
              {customer.customFields.map((f) => (
                <InfoRow key={f.fieldKey} label={f.label} value={String(f.value ?? '')} />
              ))}
            </dl>
          )}
        </Section>

        {customer.notesText && (
          <Section title="General Notes">
            <p className="whitespace-pre-wrap text-sm text-slate-600 dark:text-slate-400">{customer.notesText}</p>
          </Section>
        )}
      </div>
    </div>
  );
}

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
      <div className="mb-2.5 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{title}</h3>
        {action}
      </div>
      {children}
    </div>
  );
}

function InfoRow({ label, value, href, capitalize }: { label: string; value: string | null; href?: string; capitalize?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="shrink-0 text-slate-400 dark:text-slate-500">{label}</dt>
      <dd className={cn('truncate text-right', capitalize && 'capitalize')}>
        {value ? (
          href ? <a href={href} className="font-medium text-[var(--color-brand)]">{value}</a> : <span className="text-slate-700 dark:text-slate-300">{value}</span>
        ) : (
          <span className="text-slate-400 dark:text-slate-500">—</span>
        )}
      </dd>
    </div>
  );
}

function HistoryRow({ href, left, right, status, date }: { href: string; left: string; right: string; status: string; date?: string | null }) {
  return (
    <Link href={href} className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-slate-50 dark:hover:bg-slate-800">
      <div className="min-w-0">
        <p className="truncate font-medium text-slate-800 dark:text-slate-100">{left}</p>
        {date && <p className="text-xs text-slate-400 dark:text-slate-500">{new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-xs capitalize text-slate-600 dark:text-slate-400">{status}</span>
        <span className="font-medium text-slate-700 dark:text-slate-300">{right}</span>
        <ChevronRight className="h-3.5 w-3.5 text-slate-300 dark:text-slate-600" />
      </div>
    </Link>
  );
}
