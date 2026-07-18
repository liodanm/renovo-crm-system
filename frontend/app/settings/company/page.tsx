'use client';

import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { settingsApi, DAYS_OF_WEEK } from '../../../lib/api/settings';
import { SettingsSectionShell } from '../../../components/settings/SettingsSectionShell';
import { ApiError } from '../../../lib/api/api-client';

const inputClass = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm';
type Hours = Record<string, { open?: string; close?: string; closed?: boolean }>;

export default function CompanySettingsPage() {
  const { data: company, mutate } = useSWR('settings-company', () => settingsApi.getCompany());

  const [fields, setFields] = useState({ name: '', dba: '', addressLine1: '', city: '', state: '', postalCode: '', phone: '', email: '', website: '', taxId: '', licenseNumber: '' });
  const [hours, setHours] = useState<Hours>({});
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    if (company) {
      setFields({
        name: company.name, dba: company.dba ?? '', addressLine1: company.addressLine1 ?? '', city: company.city ?? '',
        state: company.state ?? '', postalCode: company.postalCode ?? '', phone: company.phone ?? '', email: company.email ?? '',
        website: company.website ?? '', taxId: company.taxId ?? '', licenseNumber: company.licenseNumber ?? '',
      });
      setHours(company.businessHours ?? {});
      setHasChanges(false);
    }
  }, [company]);

  function setField(key: keyof typeof fields, value: string) {
    setFields((f) => ({ ...f, [key]: value }));
    setHasChanges(true);
  }
  function setDayHours(day: string, patch: Partial<Hours[string]>) {
    setHours((h) => ({ ...h, [day]: { ...h[day], ...patch } }));
    setHasChanges(true);
  }

  async function handleSave() {
    setIsSaving(true);
    setError(null);
    try {
      await settingsApi.updateCompany({ ...fields, businessHours: hours });
      await mutate();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong saving your company info.');
    } finally {
      setIsSaving(false);
    }
  }

  function handleCancel() {
    if (company) {
      setFields({
        name: company.name, dba: company.dba ?? '', addressLine1: company.addressLine1 ?? '', city: company.city ?? '',
        state: company.state ?? '', postalCode: company.postalCode ?? '', phone: company.phone ?? '', email: company.email ?? '',
        website: company.website ?? '', taxId: company.taxId ?? '', licenseNumber: company.licenseNumber ?? '',
      });
      setHours(company.businessHours ?? {});
    }
    setHasChanges(false);
  }

  return (
    <SettingsSectionShell title="Company" description="Your business identity and contact information." hasUnsavedChanges={hasChanges} isSaving={isSaving} error={error} onSave={handleSave} onCancel={handleCancel}>
      {!company ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : (
        <>
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-slate-700">Business Identity</h2>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <LabeledInput label="Business Name" value={fields.name} onChange={(v) => setField('name', v)} />
              <LabeledInput label="DBA (Doing Business As)" value={fields.dba} onChange={(v) => setField('dba', v)} />
              <LabeledInput label="Tax ID" value={fields.taxId} onChange={(v) => setField('taxId', v)} />
              <LabeledInput label="License Number" value={fields.licenseNumber} onChange={(v) => setField('licenseNumber', v)} />
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-slate-700">Contact & Address</h2>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <LabeledInput label="Address" value={fields.addressLine1} onChange={(v) => setField('addressLine1', v)} />
              <LabeledInput label="City" value={fields.city} onChange={(v) => setField('city', v)} />
              <LabeledInput label="State" value={fields.state} onChange={(v) => setField('state', v)} />
              <LabeledInput label="Postal Code" value={fields.postalCode} onChange={(v) => setField('postalCode', v)} />
              <LabeledInput label="Phone" value={fields.phone} onChange={(v) => setField('phone', v)} />
              <LabeledInput label="Email" value={fields.email} onChange={(v) => setField('email', v)} />
              <LabeledInput label="Website" value={fields.website} onChange={(v) => setField('website', v)} />
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-slate-700">Business Hours</h2>
            <div className="mt-3 space-y-1.5">
              {DAYS_OF_WEEK.map((day) => (
                <div key={day} className="flex items-center gap-3">
                  <span className="w-24 text-sm capitalize text-slate-600">{day}</span>
                  <label className="flex items-center gap-1.5 text-xs text-slate-500">
                    <input type="checkbox" checked={!hours[day]?.closed} onChange={(e) => setDayHours(day, { closed: !e.target.checked })} className="rounded border-slate-300" />
                    Open
                  </label>
                  {!hours[day]?.closed && (
                    <>
                      <input type="time" value={hours[day]?.open ?? '08:00'} onChange={(e) => setDayHours(day, { open: e.target.value })} className="rounded-lg border border-slate-300 px-2 py-1 text-xs" />
                      <span className="text-slate-400">to</span>
                      <input type="time" value={hours[day]?.close ?? '17:00'} onChange={(e) => setDayHours(day, { close: e.target.value })} className="rounded-lg border border-slate-300 px-2 py-1 text-xs" />
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </SettingsSectionShell>
  );
}

function LabeledInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="text-xs font-medium text-slate-500">{label}</label>
      <input value={value} onChange={(e) => onChange(e.target.value)} className={`${inputClass} mt-1`} />
    </div>
  );
}
