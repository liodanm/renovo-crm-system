'use client';

import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { Info } from 'lucide-react';
import { settingsApi, type ConsentDisclosures, type UpdateConsentDisclosuresInput } from '../../../lib/api/settings';
import { SettingsSectionShell } from '../../../components/settings/SettingsSectionShell';
import { ApiError } from '../../../lib/api/api-client';

type RawForm = { sms: string; email: string; marketingSms: string };

export default function ConsentDisclosuresPage() {
  const { data: consentData, mutate } = useSWR('settings-consent-disclosures', () => settingsApi.getConsentDisclosures());
  const { data: company } = useSWR('settings-company', () => settingsApi.getCompany());

  const [form, setForm] = useState<RawForm | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    if (consentData) setForm(consentData.raw);
  }, [consentData]);

  function update(patch: Partial<RawForm>) {
    setForm((f) => (f ? { ...f, ...patch } : f));
    setHasChanges(true);
  }

  async function handleSave() {
    if (!form) return;
    setIsSaving(true);
    setError(null);
    try {
      const input: UpdateConsentDisclosuresInput = { sms: form.sms, email: form.email, marketingSms: form.marketingSms };
      await settingsApi.updateConsentDisclosures(input);
      await mutate();
      setHasChanges(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong saving Consent & Disclosures.');
    } finally {
      setIsSaving(false);
    }
  }

  function handleCancel() {
    if (consentData) setForm(consentData.raw);
    setHasChanges(false);
  }

  // Same substitution the backend does (SettingsService.getConsentDisclosures)
  // — client-side here purely so the preview updates live as you type,
  // without a round trip on every keystroke. What actually gets served
  // to a real customer is always computed server-side from the saved
  // template + the company's real name at that moment, so this can
  // never drift from production behavior — it's the exact same
  // {{businessName}} replacement, just run twice in two places.
  const businessName = company?.name ?? '{{businessName}}';
  const resolve = (template: string) => template.replaceAll('{{businessName}}', businessName);

  return (
    <SettingsSectionShell
      backHref="/settings"
      title="Consent & Disclosures"
      description="Manage the disclosures customers see when they provide communication consent."
      hasUnsavedChanges={hasChanges}
      isSaving={isSaving}
      error={error}
      onSave={handleSave}
      onCancel={handleCancel}
    >
      {!form ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">Loading…</p>
      ) : (
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">SMS &amp; Email</h2>

            <label className="mt-3 block text-sm font-medium text-slate-700 dark:text-slate-300">SMS Disclosure</label>
            <p className="text-xs text-slate-500 dark:text-slate-400">Shown to customers at the point they opt in to service-related text messages (appointment updates, estimate/invoice notifications). Use <code className="rounded bg-slate-100 dark:bg-slate-800 px-1">{'{{businessName}}'}</code> and it'll be replaced with your business name.</p>
            <textarea
              value={form.sms}
              onChange={(e) => update({ sms: e.target.value })}
              rows={4}
              maxLength={2000}
              className="mt-2 w-full rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 text-sm dark:bg-slate-900 dark:text-slate-100"
            />
            <PreviewBlock text={resolve(form.sms)} />

            <label className="mt-5 block text-sm font-medium text-slate-700 dark:text-slate-300">Email Disclosure</label>
            <p className="text-xs text-slate-500 dark:text-slate-400">Shown at the point a customer provides their email for service-related communication (estimates, invoices, appointment updates).</p>
            <textarea
              value={form.email}
              onChange={(e) => update({ email: e.target.value })}
              rows={4}
              maxLength={2000}
              className="mt-2 w-full rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 text-sm dark:bg-slate-900 dark:text-slate-100"
            />
            <PreviewBlock text={resolve(form.email)} />
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Marketing SMS</h2>

            <div className="mt-2 flex gap-2 rounded-lg bg-blue-50 dark:bg-blue-950 p-3 text-xs text-blue-800 dark:text-blue-300">
              <Info className="mt-0.5 h-4 w-4 shrink-0" />
              <p>Marketing SMS consent is separate from service and transactional SMS consent. On the Instant Quote form, a customer can always submit a quote without opting into marketing messages — this box is never required and never checked by default.</p>
            </div>

            <label className="mt-3 block text-sm font-medium text-slate-700 dark:text-slate-300">Marketing SMS Disclosure</label>
            <textarea
              value={form.marketingSms}
              onChange={(e) => update({ marketingSms: e.target.value })}
              rows={4}
              maxLength={2000}
              className="mt-2 w-full rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 text-sm dark:bg-slate-900 dark:text-slate-100"
            />
            <PreviewBlock text={resolve(form.marketingSms)} />
          </div>
        </div>
      )}
    </SettingsSectionShell>
  );
}

function PreviewBlock({ text }: { text: string }) {
  return (
    <div className="mt-2 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-3">
      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Preview</p>
      <p className="text-sm text-slate-700 dark:text-slate-300">{text}</p>
    </div>
  );
}
