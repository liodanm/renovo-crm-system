'use client';

import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { settingsApi } from '../../../lib/api/settings';
import { SettingsSectionShell } from '../../../components/settings/SettingsSectionShell';
import { ApiError } from '../../../lib/api/api-client';

const inputClass = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm';

export default function BrandingSettingsPage() {
  const { data: branding, mutate } = useSWR('settings-branding', () => settingsApi.getBranding());

  const [primaryColor, setPrimaryColor] = useState('#0e7490');
  const [secondaryColor, setSecondaryColor] = useState('#155e75');
  const [estimateHeader, setEstimateHeader] = useState('');
  const [invoiceHeader, setInvoiceHeader] = useState('');
  const [footerMessage, setFooterMessage] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    if (branding) {
      setPrimaryColor(branding.primaryColor ?? '#0e7490');
      setSecondaryColor(branding.secondaryColor ?? '#155e75');
      setEstimateHeader(branding.estimateHeader ?? '');
      setInvoiceHeader(branding.invoiceHeader ?? '');
      setFooterMessage(branding.footerMessage ?? '');
      setHasChanges(false);
    }
  }, [branding]);

  function track<T>(setter: (v: T) => void) {
    return (v: T) => { setter(v); setHasChanges(true); };
  }

  async function handleSave() {
    setIsSaving(true);
    setError(null);
    try {
      await settingsApi.updateBranding({ primaryColor, secondaryColor, estimateHeader: estimateHeader || undefined, invoiceHeader: invoiceHeader || undefined, footerMessage: footerMessage || undefined });
      await mutate();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong saving your branding.');
    } finally {
      setIsSaving(false);
    }
  }

  function handleCancel() {
    if (branding) {
      setPrimaryColor(branding.primaryColor ?? '#0e7490');
      setSecondaryColor(branding.secondaryColor ?? '#155e75');
      setEstimateHeader(branding.estimateHeader ?? '');
      setInvoiceHeader(branding.invoiceHeader ?? '');
      setFooterMessage(branding.footerMessage ?? '');
    }
    setHasChanges(false);
  }

  return (
    <SettingsSectionShell
      title="Branding"
      description="Colors and messaging for estimates and invoices. Document generation doesn't exist yet, so this stores the data for the day it does."
      hasUnsavedChanges={hasChanges}
      isSaving={isSaving}
      error={error}
      onSave={handleSave}
      onCancel={handleCancel}
    >
      {!branding ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs font-medium text-slate-500">Primary Color</label>
              <div className="mt-1 flex items-center gap-2">
                <input type="color" value={primaryColor} onChange={(e) => track(setPrimaryColor)(e.target.value)} className="h-9 w-12 rounded border border-slate-300" />
                <input value={primaryColor} onChange={(e) => track(setPrimaryColor)(e.target.value)} className={inputClass} />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500">Secondary Color</label>
              <div className="mt-1 flex items-center gap-2">
                <input type="color" value={secondaryColor} onChange={(e) => track(setSecondaryColor)(e.target.value)} className="h-9 w-12 rounded border border-slate-300" />
                <input value={secondaryColor} onChange={(e) => track(setSecondaryColor)(e.target.value)} className={inputClass} />
              </div>
            </div>
          </div>
          <div className="mt-3">
            <label className="text-xs font-medium text-slate-500">Estimate Header</label>
            <input value={estimateHeader} onChange={(e) => track(setEstimateHeader)(e.target.value)} placeholder="e.g. Thank you for the opportunity to quote your project" className={`${inputClass} mt-1`} />
          </div>
          <div className="mt-3">
            <label className="text-xs font-medium text-slate-500">Invoice Header</label>
            <input value={invoiceHeader} onChange={(e) => track(setInvoiceHeader)(e.target.value)} className={`${inputClass} mt-1`} />
          </div>
          <div className="mt-3">
            <label className="text-xs font-medium text-slate-500">Footer Message</label>
            <textarea value={footerMessage} onChange={(e) => track(setFooterMessage)(e.target.value)} rows={2} className={`${inputClass} mt-1`} />
          </div>
        </div>
      )}
    </SettingsSectionShell>
  );
}
