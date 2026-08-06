'use client';

import { useEffect, useRef, useState } from 'react';
import useSWR from 'swr';
import { settingsApi } from '../../../lib/api/settings';
import { SettingsSectionShell } from '../../../components/settings/SettingsSectionShell';
import { ApiError } from '../../../lib/api/api-client';

const inputClass = 'w-full rounded-lg border border-slate-300 px-3 py-3 text-base lg:py-2 lg:text-sm';

export default function BrandingSettingsPage() {
  const { data: branding, mutate } = useSWR('settings-branding', () => settingsApi.getBranding());

  const [primaryColor, setPrimaryColor] = useState('#0e7490');
  const [secondaryColor, setSecondaryColor] = useState('#155e75');
  const [estimateHeader, setEstimateHeader] = useState('');
  const [invoiceHeader, setInvoiceHeader] = useState('');
  const [footerMessage, setFooterMessage] = useState('');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (branding) {
      setPrimaryColor(branding.primaryColor ?? '#0e7490');
      setSecondaryColor(branding.secondaryColor ?? '#155e75');
      setEstimateHeader(branding.estimateHeader ?? '');
      setInvoiceHeader(branding.invoiceHeader ?? '');
      setFooterMessage(branding.footerMessage ?? '');
      setLogoUrl(branding.logoUrl ?? null);
      setHasChanges(false);
    }
  }, [branding]);

  function track<T>(setter: (v: T) => void) {
    return (v: T) => { setter(v); setHasChanges(true); };
  }

  // Logo saves immediately on upload — it's a single, standalone
  // change (not part of the same "type several fields then click Save"
  // flow as colors/headers), and leaving it pending alongside unrelated
  // edits risks losing it if the person navigates away before saving
  // everything else.
  async function handleLogoSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoError(null);
    setIsUploadingLogo(true);
    try {
      const { uploadUrl, publicUrl } = await settingsApi.presignLogoUpload(file.name, file.type);
      const putResponse = await fetch(uploadUrl, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } });
      if (!putResponse.ok) throw new Error('Upload to storage failed');
      await settingsApi.updateBranding({ logoUrl: publicUrl });
      setLogoUrl(publicUrl);
      await mutate();
    } catch (err) {
      setLogoError(err instanceof Error ? err.message : 'Logo upload failed');
    } finally {
      setIsUploadingLogo(false);
      if (logoInputRef.current) logoInputRef.current.value = '';
    }
  }

  async function handleRemoveLogo() {
    setLogoError(null);
    try {
      await settingsApi.updateBranding({ logoUrl: '' });
      setLogoUrl(null);
      await mutate();
    } catch (err) {
      setLogoError(err instanceof Error ? err.message : 'Could not remove the logo.');
    }
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
      description="Your logo, colors, and messaging — shown on every Estimate and Invoice PDF."
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
          <div>
            <label className="text-xs font-medium text-slate-500">Logo</label>
            <div className="mt-1 flex items-center gap-3">
              {logoUrl ? (
                <img src={logoUrl} alt="Company logo" className="h-14 w-auto rounded border border-slate-200 bg-white object-contain p-1" />
              ) : (
                <div className="flex h-14 w-14 items-center justify-center rounded border border-dashed border-slate-300 text-[10px] text-slate-400">No logo</div>
              )}
              <div className="flex flex-col gap-1">
                <button
                  type="button"
                  onClick={() => logoInputRef.current?.click()}
                  disabled={isUploadingLogo}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  {isUploadingLogo ? 'Uploading…' : logoUrl ? 'Replace logo' : 'Upload logo'}
                </button>
                {logoUrl && (
                  <button type="button" onClick={handleRemoveLogo} className="text-xs text-red-600 hover:underline">
                    Remove
                  </button>
                )}
              </div>
              <input ref={logoInputRef} type="file" accept="image/png,image/jpeg" onChange={handleLogoSelected} className="hidden" />
            </div>
            {logoError && <p className="mt-1 text-xs text-red-600">{logoError}</p>}
          </div>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
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
