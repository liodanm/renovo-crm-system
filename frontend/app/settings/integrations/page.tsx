'use client';

import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { settingsApi, IntegrationCard } from '../../../lib/api/settings';
import { SettingsSectionShell } from '../../../components/settings/SettingsSectionShell';
import { IntegrationProviderCard } from '../../../components/settings/IntegrationProviderCard';
import { SystemHealthGrid } from '../../../components/settings/SystemHealthGrid';
import { ComingSoonIntegrationCard } from '../../../components/settings/ComingSoonIntegrationCard';
import { ApiError } from '../../../lib/api/api-client';

const COMING_SOON = [
  { key: 'roof-measurement', name: 'Roof Measurement Provider', description: 'Automatic roof area from an address', logoInitial: 'RM' },
  { key: 'google-maps', name: 'Google Maps', description: 'Route distance and address autocomplete', logoInitial: 'GM' },
  { key: 'quickbooks', name: 'QuickBooks', description: 'Sync invoices and payments to your books', logoInitial: 'QB' },
  { key: 'zapier', name: 'Zapier', description: 'Connect Renovo to thousands of other apps', logoInitial: 'ZP' },
  { key: 'google-calendar', name: 'Google Calendar', description: 'Two-way sync for scheduled jobs', logoInitial: 'GC' },
  { key: 'outlook', name: 'Outlook', description: 'Two-way sync for scheduled jobs', logoInitial: 'OL' },
  { key: 'companycam', name: 'CompanyCam', description: 'Job-site photo documentation', logoInitial: 'CC' },
];

function findCard(cards: IntegrationCard[] | undefined, key: string): IntegrationCard | undefined {
  return cards?.find((c) => c.key === key);
}

export default function IntegrationsSettingsPage() {
  const { data: cards, mutate: mutateCards } = useSWR('settings-integrations', () => settingsApi.getIntegrations());
  const { data: health } = useSWR('settings-integrations-health', () => settingsApi.getIntegrationsHealth());
  const { data: links, mutate: mutateLinks } = useSWR('settings-integrations-links', () => settingsApi.getBusinessLinks());

  const [form, setForm] = useState({ googleReviewUrl: '', website: '', facebook: '', instagram: '' });
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [testEmail, setTestEmail] = useState('');
  const [testPhone, setTestPhone] = useState('');

  useEffect(() => {
    if (links) {
      setForm({
        googleReviewUrl: links.googleReviewUrl ?? '',
        website: links.website ?? '',
        facebook: links.facebook ?? '',
        instagram: links.instagram ?? '',
      });
      setHasChanges(false);
    }
  }, [links]);

  function updateField(key: keyof typeof form, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setHasChanges(true);
  }

  async function handleSave() {
    setIsSaving(true);
    setError(null);
    try {
      await settingsApi.updateBusinessLinks({
        googleReviewUrl: form.googleReviewUrl || undefined,
        website: form.website || undefined,
        facebook: form.facebook || undefined,
        instagram: form.instagram || undefined,
      });
      await mutateLinks();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong.');
    } finally {
      setIsSaving(false);
    }
  }

  function handleCancel() {
    if (links) {
      setForm({
        googleReviewUrl: links.googleReviewUrl ?? '',
        website: links.website ?? '',
        facebook: links.facebook ?? '',
        instagram: links.instagram ?? '',
      });
    }
    setHasChanges(false);
  }

  const stripe = findCard(cards, 'stripe');
  const postmark = findCard(cards, 'postmark');
  const twilio = findCard(cards, 'twilio');
  const anthropic = findCard(cards, 'anthropic');
  const s3 = findCard(cards, 's3');

  return (
    <SettingsSectionShell
      title="Integrations"
      description="Provider connection status, real connectivity checks, and system health — every real secret still lives in Railway environment variables, never here."
      hasUnsavedChanges={hasChanges}
      isSaving={isSaving}
      error={error}
      onSave={handleSave}
      onCancel={handleCancel}
    >
      {health && <SystemHealthGrid health={health} />}

      {!cards ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">Loading integrations…</p>
      ) : (
        <>
          <h2 className="pt-2 text-sm font-semibold text-slate-700 dark:text-slate-300">Connected Providers</h2>
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {stripe && (
              <IntegrationProviderCard
                card={stripe}
                logoInitial="ST"
                logoColorClass="bg-indigo-600"
                docsUrl="https://stripe.com/docs"
                extraRows={[
                  { label: 'Mode', value: typeof stripe.meta?.mode === 'string' ? (stripe.meta.mode === 'live' ? 'Live' : 'Test') : 'Unknown' },
                  { label: 'Webhook Secret', value: stripe.configured ? 'Set (Railway)' : 'Not set' },
                ]}
                onVerify={() => settingsApi.verifyIntegration('stripe').then((r) => { mutateCards(); return r; })}
              />
            )}

            {postmark && (
              <IntegrationProviderCard
                card={postmark}
                logoInitial="PM"
                logoColorClass="bg-yellow-600"
                docsUrl="https://postmarkapp.com/developer"
                extraRows={[{ label: 'Verified Sender', value: typeof postmark.meta?.serverName === 'string' ? postmark.meta.serverName : 'Unknown' }]}
                onVerify={() => settingsApi.verifyIntegration('postmark').then((r) => { mutateCards(); return r; })}
                onTest={() => settingsApi.testPostmarkIntegration(testEmail).then((r) => { mutateCards(); return r; })}
                testLabel="Send Test Email"
                testDisabled={!testEmail}
                testInput={
                  <input value={testEmail} onChange={(e) => setTestEmail(e.target.value)} placeholder="you@example.com" className="w-full rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-xs dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-400" />
                }
              />
            )}

            {twilio && (
              <IntegrationProviderCard
                card={twilio}
                logoInitial="TW"
                logoColorClass="bg-red-600"
                docsUrl="https://www.twilio.com/docs"
                extraRows={[
                  { label: 'Phone Number', value: typeof twilio.meta?.phoneNumber === 'string' ? twilio.meta.phoneNumber : 'Unknown' },
                  { label: 'Messaging Service', value: 'Uses phone number (no Messaging Service SID configured)' },
                ]}
                onVerify={() => settingsApi.verifyIntegration('twilio').then((r) => { mutateCards(); return r; })}
                onTest={() => settingsApi.testTwilioIntegration(testPhone).then((r) => { mutateCards(); return r; })}
                testLabel="Send Test SMS"
                testDisabled={!testPhone}
                testInput={
                  <input value={testPhone} onChange={(e) => setTestPhone(e.target.value)} placeholder="+1 555 123 4567" className="w-full rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-xs dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-400" />
                }
              />
            )}

            {anthropic && (
              <IntegrationProviderCard
                card={anthropic}
                logoInitial="AN"
                logoColorClass="bg-orange-700"
                docsUrl="https://docs.claude.com"
                extraRows={[{ label: 'Current Model', value: typeof anthropic.meta?.model === 'string' ? anthropic.meta.model : 'claude-sonnet-4-6' }]}
                onVerify={() => settingsApi.verifyIntegration('anthropic').then((r) => { mutateCards(); return r; })}
                onTest={() => settingsApi.testAnthropicIntegration().then((r) => { mutateCards(); return r; })}
                testLabel="Test AI Request"
              />
            )}

            {s3 && (
              <IntegrationProviderCard
                card={s3}
                logoInitial="S3"
                logoColorClass="bg-slate-700"
                docsUrl="https://docs.aws.amazon.com/s3"
                extraRows={[
                  { label: 'Bucket', value: typeof s3.meta?.bucket === 'string' ? s3.meta.bucket : 'Unknown' },
                  { label: 'Region', value: typeof s3.meta?.region === 'string' ? s3.meta.region : 'Unknown' },
                ]}
                onVerify={() => settingsApi.verifyIntegration('s3').then((r) => { mutateCards(); return r; })}
                onTest={() => settingsApi.testS3Integration().then((r) => { mutateCards(); return r; })}
                testLabel="Upload Test File"
              />
            )}
          </div>
        </>
      )}

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Business Links</h2>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Public links used on customer-facing pages and automation messages — not credentials, safe to store.</p>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Google Review URL</label>
            <input value={form.googleReviewUrl} onChange={(e) => updateField('googleReviewUrl', e.target.value)} placeholder="https://g.page/r/..." className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-3 text-base lg:py-2 lg:text-sm dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-400" />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Website</label>
            <input value={form.website} onChange={(e) => updateField('website', e.target.value)} placeholder="https://yourcompany.com" className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-3 text-base lg:py-2 lg:text-sm dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-400" />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Facebook</label>
            <input value={form.facebook} onChange={(e) => updateField('facebook', e.target.value)} placeholder="https://facebook.com/yourcompany" className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-3 text-base lg:py-2 lg:text-sm dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-400" />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Instagram</label>
            <input value={form.instagram} onChange={(e) => updateField('instagram', e.target.value)} placeholder="https://instagram.com/yourcompany" className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-3 text-base lg:py-2 lg:text-sm dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-400" />
          </div>
        </div>
      </div>

      <div>
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Coming Soon</h2>
        <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
          {COMING_SOON.map((c) => (
            <ComingSoonIntegrationCard key={c.key} name={c.name} description={c.description} logoInitial={c.logoInitial} />
          ))}
        </div>
      </div>
    </SettingsSectionShell>
  );
}
