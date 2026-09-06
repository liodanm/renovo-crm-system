'use client';

import { useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { CalendarClock, ChevronRight, Star, X } from 'lucide-react';
import { customersApi, CustomerProfile, ServiceHistory } from '../../../lib/api/customers';
import { CardSkeleton } from '../../dashboard/dashboard-card';
import { cn } from '../../../lib/utils';
import { ApiError } from '../../../lib/api/api-client';
import { settingsApi } from '../../../lib/api/settings';

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
  onServiceHistoryUpdated,
  onNavigateTab,
}: {
  customer: CustomerProfile;
  serviceHistory: ServiceHistory | undefined;
  onUpdated: () => void;
  onServiceHistoryUpdated: () => void;
  onNavigateTab: (tab: 'Properties' | 'Activity') => void;
}) {
  const [isEditingTags, setIsEditingTags] = useState(false);
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState(customer.tags);
  const [savingTags, setSavingTags] = useState(false);
  const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);
  const [isMarkingReceived, setIsMarkingReceived] = useState(false);

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

  async function handleMarkReviewReceived() {
    setIsMarkingReceived(true);
    try {
      await customersApi.markReviewReceived(customer.id);
      onServiceHistoryUpdated();
    } finally {
      setIsMarkingReceived(false);
    }
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
              <Link href={nextAction.href} className="shrink-0 rounded-lg bg-[var(--color-brand)] dark:bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90">
                {nextAction.cta}
              </Link>
            </div>
          )}
        </Section>

        <Section title="Recent Activity" action={<button onClick={() => onNavigateTab('Activity')} className="text-xs text-[var(--color-brand)] dark:text-blue-400 hover:underline">View All Activity</button>}>
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
            <Link href={`/jobs/${upcomingJob.id}`} className="flex items-center gap-3 text-sm text-slate-700 dark:text-slate-300 hover:text-[var(--color-brand)] dark:hover:text-blue-400">
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

      {/* ---- RIGHT: Reviews, Customer Info, Property, Tags, Custom Fields ---- */}
      <div className="space-y-4">
        <Section title="Reviews">
          {!serviceHistory && <CardSkeleton lines={2} />}
          {serviceHistory && (
            <ReviewsSectionBody
              customer={customer}
              intelligence={serviceHistory.intelligence}
              isMarkingReceived={isMarkingReceived}
              onRequestClick={() => setIsRequestModalOpen(true)}
              onMarkReceivedClick={handleMarkReviewReceived}
            />
          )}
        </Section>

        <Section title="Contact">
          <dl className="space-y-1.5 text-sm">
            <InfoRow label="Phone" value={customer.phone} href={customer.phone ? `tel:${customer.phone}` : undefined} />
            {customer.secondaryPhone && <InfoRow label="Secondary" value={customer.secondaryPhone} href={`tel:${customer.secondaryPhone}`} />}
            <InfoRow label="Email" value={customer.email} href={customer.email ? `mailto:${customer.email}` : undefined} />
          </dl>
        </Section>

        <CommunicationConsentSection customer={customer} onUpdated={onUpdated} />

        <Section title="Customer Details">
          <dl className="space-y-1.5 text-sm">
            <InfoRow label="Type" value={customer.customerType} capitalize />
            <InfoRow label="Lead Source" value={customer.source} />
            <InfoRow label="Lead Status" value={customer.leadStatus} capitalize />
          </dl>
        </Section>

        <Section title={customer.properties.length > 1 ? 'Properties' : 'Property'} action={customer.properties.length > 1 ? <button onClick={() => onNavigateTab('Properties')} className="text-xs text-[var(--color-brand)] dark:text-blue-400 hover:underline">View All</button> : undefined}>
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

      {isRequestModalOpen && (
        <RequestReviewModal
          customer={customer}
          onClose={() => setIsRequestModalOpen(false)}
          onSent={() => {
            setIsRequestModalOpen(false);
            onServiceHistoryUpdated();
          }}
        />
      )}
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
          href ? <a href={href} className="font-medium text-[var(--color-brand)] dark:text-blue-400">{value}</a> : <span className="text-slate-700 dark:text-slate-300">{value}</span>
        ) : (
          <span className="text-slate-400 dark:text-slate-500">—</span>
        )}
      </dd>
    </div>
  );
}

/**
 * Staff-facing visibility + control for the consent fields migration
 * 050 added. SMS/Email rows are read-only status (recorded only
 * through an actual customer action — Instant Quote today, more
 * sources later) — staff can SEE it, but the only way to grant it is
 * the customer actually consenting somewhere real, never a staff
 * click, which is exactly what keeps this proof meaningful.
 *
 * Marketing SMS is the one row staff can change directly, because a
 * business commonly collects this verbally/in-person and needs a way
 * to record it — but it's a deliberate, separate, explicit action
 * (see CustomersService.setMarketingSmsConsent's own comment), never
 * inferred from SMS/Email consent existing.
 */
function CommunicationConsentSection({ customer, onUpdated }: { customer: CustomerProfile; onUpdated: () => void }) {
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggleMarketing() {
    setIsSaving(true);
    setError(null);
    try {
      await customersApi.setMarketingSmsConsent(customer.id, !customer.marketingSmsConsent);
      onUpdated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't update marketing SMS consent.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Section title="Communication Consent">
      <dl className="space-y-1.5 text-sm">
        <div className="flex items-center justify-between gap-2">
          <dt className="text-slate-400 dark:text-slate-500">SMS</dt>
          <dd className={customer.smsConsentAt ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400 dark:text-slate-500'}>
            {customer.smsConsentAt ? '✓ Consented' : 'Not on file'}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-2">
          <dt className="text-slate-400 dark:text-slate-500">Email</dt>
          <dd className={customer.emailConsentAt ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400 dark:text-slate-500'}>
            {customer.emailConsentAt ? '✓ Consented' : 'Not on file'}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-slate-100 dark:border-slate-800 pt-1.5">
          <dt className="text-slate-400 dark:text-slate-500">Marketing SMS</dt>
          <dd>
            <button
              onClick={toggleMarketing}
              disabled={isSaving}
              className={cn(
                'rounded-full px-2 py-0.5 text-xs font-medium disabled:opacity-50',
                customer.marketingSmsConsent ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400',
              )}
            >
              {isSaving ? 'Saving…' : customer.marketingSmsConsent ? '✓ Subscribed' : 'Not subscribed'}
            </button>
          </dd>
        </div>
      </dl>
      {error && <p className="mt-1.5 text-xs text-red-600 dark:text-red-400">{error}</p>}
      <p className="mt-2 text-[11px] text-slate-400 dark:text-slate-500">Tap Marketing SMS to record a customer's verbal or in-person opt-in/opt-out. SMS and Email consent are only ever recorded from an actual customer action, never set here.</p>
    </Section>
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

/**
 * The four states the audit's Customer Review Management spec calls
 * for: Review Received / Review Requested / Not Requested / Unable to
 * Request. "Unable to Request" is checked first and wins regardless of
 * reviewStatus — a customer with no phone can't have a real pending
 * request in any meaningful sense, no matter what the backend log says.
 *
 * "reviewCooldownUntil" (from serviceHistory.intelligence, computed
 * server-side in getServiceHistory) is shown proactively here — the
 * customer sees the real next-eligible date before ever clicking
 * anything, not only as an error message after a blocked attempt.
 */
function ReviewsSectionBody({
  customer,
  intelligence,
  isMarkingReceived,
  onRequestClick,
  onMarkReceivedClick,
}: {
  customer: CustomerProfile;
  intelligence: ServiceHistory['intelligence'];
  isMarkingReceived: boolean;
  onRequestClick: () => void;
  onMarkReceivedClick: () => void;
}) {
  const hasPhone = Boolean(customer.phone);
  const cooldownActive = intelligence.reviewCooldownUntil && new Date(intelligence.reviewCooldownUntil) > new Date();

  if (intelligence.reviewStatus === 'received') {
    return (
      <div>
        <div className="flex items-center gap-1 text-amber-500">
          {[0, 1, 2, 3, 4].map((i) => <Star key={i} className="h-4 w-4 fill-current" />)}
        </div>
        <p className="mt-1.5 text-sm font-medium text-slate-800 dark:text-slate-100">Review Received</p>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Manually recorded · Google
          {intelligence.reviewReceivedAt && ` · ${new Date(intelligence.reviewReceivedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`}
        </p>
      </div>
    );
  }

  if (!hasPhone) {
    return (
      <div>
        <p className="text-sm font-medium text-slate-800 dark:text-slate-100">Unable to request review</p>
        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">No valid mobile phone number on file.</p>
      </div>
    );
  }

  return (
    <div>
      <p className="text-sm font-medium text-slate-800 dark:text-slate-100">
        {intelligence.reviewStatus === 'never_requested' ? 'Not Requested' : 'Review Requested'}
      </p>
      {intelligence.reviewLastRequestedAt && (
        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
          Requested {new Date(intelligence.reviewLastRequestedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          {' · '}
          SMS {intelligence.reviewStatus === 'failed' ? 'Failed' : 'Sent'}
        </p>
      )}
      {cooldownActive && intelligence.reviewCooldownUntil && (
        <p className="mt-0.5 text-xs text-amber-600 dark:text-amber-400">
          Already requested recently — next eligible {new Date(intelligence.reviewCooldownUntil).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          onClick={onRequestClick}
          disabled={Boolean(cooldownActive)}
          className="rounded-lg bg-[var(--color-brand)] px-3 py-2 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-40"
        >
          {intelligence.reviewStatus === 'never_requested' ? 'Request Review by Text' : 'Request Again'}
        </button>
        <button
          onClick={onMarkReceivedClick}
          disabled={isMarkingReceived}
          className="rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40"
        >
          {isMarkingReceived ? 'Saving…' : 'Mark Review Received'}
        </button>
      </div>
    </div>
  );
}

/**
 * Confirmation modal — customer name/phone + a preview of what will be
 * sent, before anything actually goes out. The preview text mirrors
 * the backend's own default template (buildReviewRequestMessage's
 * fallback in review-message.util.ts) using the company's real name
 * (fetched via the existing settingsApi.getCompany(), not duplicated
 * or invented) and a placeholder for the review link, since the real
 * URL is resolved server-side at send time from Settings > Integrations
 * — not fetched again here just to render a preview. If the company
 * has customized their review-request template in Settings >
 * Automation, the actual message sent may differ from this preview;
 * said so directly in the UI rather than silently showing something
 * that might not match what's actually sent.
 */
function RequestReviewModal({ customer, onClose, onSent }: { customer: CustomerProfile; onClose: () => void; onSent: () => void }) {
  const { data: company } = useSWR('company-settings-preview', () => settingsApi.getCompany());
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<{ message: string; nextEligibleAt?: string } | null>(null);

  const firstName = customer.firstName || 'there';
  const previewMessage = `Hi ${firstName}, thank you for choosing ${company?.name ?? '…'}! If you were happy with our service, we'd really appreciate a quick Google review. It only takes a minute: [Google Review Link] Thank you!`;

  async function handleSend() {
    setIsSending(true);
    setError(null);
    try {
      await customersApi.requestReview(customer.id);
      onSent();
    } catch (err) {
      if (err instanceof ApiError) {
        const details = err.details as { nextEligibleAt?: string } | undefined;
        setError({ message: err.message, nextEligibleAt: details?.nextEligibleAt });
      } else {
        setError({ message: 'Unable to send the review request. Please try again.' });
      }
    } finally {
      setIsSending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-xl bg-white dark:bg-slate-900 p-5 shadow-xl">
        <div className="flex items-start justify-between">
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Request Review by Text</h3>
          <button onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
            <X className="h-4 w-4" />
          </button>
        </div>

        <dl className="mt-3 space-y-1 text-sm">
          <div className="flex justify-between"><dt className="text-slate-400 dark:text-slate-500">To</dt><dd className="text-slate-700 dark:text-slate-300">{customer.firstName} {customer.lastName}</dd></div>
          <div className="flex justify-between"><dt className="text-slate-400 dark:text-slate-500">Phone</dt><dd className="text-slate-700 dark:text-slate-300">{customer.phone}</dd></div>
        </dl>

        <div className="mt-3 rounded-lg bg-slate-50 dark:bg-slate-800 p-3 text-sm text-slate-700 dark:text-slate-300">{previewMessage}</div>
        <p className="mt-1.5 text-[11px] text-slate-400 dark:text-slate-500">
          The real Google Review link is filled in automatically from Settings → Integrations. If you've customized this message in Settings → Automation, the actual text sent may differ slightly from this preview.
        </p>

        {error && (
          <p className="mt-3 text-xs text-red-600 dark:text-red-400">
            {error.message}
            {error.nextEligibleAt && ` Next eligible: ${new Date(error.nextEligibleAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}.`}
          </p>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-slate-300 dark:border-slate-700 px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800">
            Cancel
          </button>
          <button
            onClick={handleSend}
            disabled={isSending}
            className="rounded-lg bg-[var(--color-brand)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-40"
          >
            {isSending ? 'Sending…' : 'Send Review Request'}
          </button>
        </div>
      </div>
    </div>
  );
}

