'use client';

import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { Copy, Check, ExternalLink } from 'lucide-react';
import { SettingsSectionShell } from '../../../components/settings/SettingsSectionShell';
import { settingsApi } from '../../../lib/api/settings';

/**
 * Real gap this page closes: the public Quote Tool (/quote/[companySlug])
 * has existed and worked since earlier this session, but nothing inside
 * Renovo itself ever showed the owner the link — there was no way to
 * find it except knowing the exact URL by heart. This page doesn't
 * build anything new; it surfaces what already exists.
 *
 * The link is built from window.location.origin, not a hardcoded
 * domain or a separate env var — it always exactly matches whatever
 * domain the owner is currently viewing Renovo from, so it can never
 * silently drift out of sync with the real deployment.
 */
export default function QuoteToolSettingsPage() {
  const { data: company } = useSWR('settings-company-quote-tool', () => settingsApi.getCompany());
  const [copied, setCopied] = useState(false);
  // Real bug caught before shipping: window.location.origin can't be
  // read directly during render — this is a client component, but
  // Next.js still server-renders it on first load, where `window`
  // doesn't exist at all and this would have crashed. Resolved via
  // useEffect instead, which only ever runs after mounting in the
  // browser, avoiding both the crash and any server/client hydration
  // mismatch.
  const [origin, setOrigin] = useState<string | null>(null);
  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const quoteUrl = company && origin ? `${origin}/quote/${company.slug}` : null;

  async function handleCopy() {
    if (!quoteUrl) return;
    await navigator.clipboard.writeText(quoteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <SettingsSectionShell
      backHref="/settings"
      title="Quote Tool"
      description="Let customers request or receive an estimate directly from your website, without calling you."
      hasUnsavedChanges={false}
      isSaving={false}
      error={null}
      onSave={() => undefined}
      onCancel={() => undefined}
    >
      <div className="space-y-6">
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Your Quote Link</h3>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Share this link directly, or add it to your website as a &quot;Get an Instant Quote&quot; button.
          </p>

          {!company && <div className="mt-3 h-11 w-full animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />}

          {quoteUrl && (
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <div className="flex-1 truncate rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2.5 font-mono text-sm text-slate-700 dark:text-slate-300">
                {quoteUrl}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleCopy}
                  className="flex items-center justify-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2.5 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                  {copied ? 'Copied' : 'Copy'}
                </button>
                <a
                  href={quoteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-1.5 rounded-lg bg-[var(--color-brand)] px-3 py-2.5 text-sm font-medium text-white hover:opacity-90"
                >
                  <ExternalLink className="h-4 w-4" /> Preview
                </a>
              </div>
            </div>
          )}
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">How it works</h3>
          <ul className="mt-2 space-y-1.5 text-sm text-slate-600 dark:text-slate-400">
            <li>• A visitor selects a service, enters their property and contact info, and reviews their request.</li>
            <li>• Services configured as <strong>Instant Estimate</strong> in your Service Catalog get a real price immediately, and an Estimate is created and emailed to them automatically.</li>
            <li>• Services configured as <strong>Request Quote</strong> skip pricing — the customer submits their info, and you follow up manually.</li>
            <li>• Either way, you get notified the moment a new quote comes in — check the notification bell on your Dashboard.</li>
          </ul>
          <p className="mt-3 text-xs text-slate-400 dark:text-slate-500">
            To control which services are instant vs. request-only, go to Service Catalog and edit each service&apos;s &quot;Online Quote&quot; setting.
          </p>
        </div>
      </div>
    </SettingsSectionShell>
  );
}
