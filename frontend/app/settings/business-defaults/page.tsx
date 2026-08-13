'use client';

import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { settingsApi } from '../../../lib/api/settings';
import { SettingsSectionShell } from '../../../components/settings/SettingsSectionShell';
import { ApiError } from '../../../lib/api/api-client';

const inputClass = 'w-full rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-3 text-base lg:py-2 lg:text-sm dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-400 dark:disabled:bg-slate-800 dark:disabled:text-slate-500';

export default function BusinessDefaultsPage() {
  const { data: defaults, mutate } = useSWR('settings-business-defaults', () => settingsApi.getBusinessDefaults());

  const [taxRate, setTaxRate] = useState('');
  const [arrivalWindow, setArrivalWindow] = useState('');
  const [estimateExpiration, setEstimateExpiration] = useState('');
  const [invoiceDue, setInvoiceDue] = useState('');
  const [laborRate, setLaborRate] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [measurementSystem, setMeasurementSystem] = useState('imperial');
  const [distanceUnit, setDistanceUnit] = useState('miles');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    if (defaults) {
      setTaxRate(defaults.defaultTaxRatePercent ?? '');
      setArrivalWindow(defaults.defaultArrivalWindowMinutes?.toString() ?? '');
      setEstimateExpiration(defaults.defaultEstimateExpirationDays?.toString() ?? '');
      setInvoiceDue(defaults.defaultInvoiceDueDays?.toString() ?? '');
      setLaborRate(defaults.defaultLaborRate ?? '');
      setCurrency(defaults.currency);
      setMeasurementSystem(defaults.measurementUnitSystem);
      setDistanceUnit(defaults.distanceUnit);
      setHasChanges(false);
    }
  }, [defaults]);

  function track<T>(setter: (v: T) => void) {
    return (v: T) => { setter(v); setHasChanges(true); };
  }

  async function handleSave() {
    setIsSaving(true);
    setError(null);
    try {
      await settingsApi.updateBusinessDefaults({
        defaultTaxRatePercent: taxRate ? Number(taxRate) : undefined,
        defaultArrivalWindowMinutes: arrivalWindow ? Number(arrivalWindow) : undefined,
        defaultEstimateExpirationDays: estimateExpiration ? Number(estimateExpiration) : undefined,
        defaultInvoiceDueDays: invoiceDue ? Number(invoiceDue) : undefined,
        defaultLaborRate: laborRate ? Number(laborRate) : undefined,
        currency, measurementUnitSystem: measurementSystem, distanceUnit,
      } as any);
      await mutate();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong saving your defaults.');
    } finally {
      setIsSaving(false);
    }
  }

  function handleCancel() {
    if (defaults) {
      setTaxRate(defaults.defaultTaxRatePercent ?? '');
      setArrivalWindow(defaults.defaultArrivalWindowMinutes?.toString() ?? '');
      setEstimateExpiration(defaults.defaultEstimateExpirationDays?.toString() ?? '');
      setInvoiceDue(defaults.defaultInvoiceDueDays?.toString() ?? '');
      setLaborRate(defaults.defaultLaborRate ?? '');
      setCurrency(defaults.currency);
      setMeasurementSystem(defaults.measurementUnitSystem);
      setDistanceUnit(defaults.distanceUnit);
    }
    setHasChanges(false);
  }

  return (
    <SettingsSectionShell backHref="/settings"
      title="Business Defaults"
      description="These values automatically pre-fill new Estimates, Jobs, and Scheduling — already wired in, not just stored."
      hasUnsavedChanges={hasChanges}
      isSaving={isSaving}
      error={error}
      onSave={handleSave}
      onCancel={handleCancel}
    >
      {!defaults ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">Loading…</p>
      ) : (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Default Tax Rate (%)">
              <input value={taxRate} onChange={(e) => track(setTaxRate)(e.target.value.replace(/[^0-9.]/g, ''))} inputMode="decimal" className={inputClass} />
            </Field>
            <Field label="Default Arrival Window (minutes)">
              <input value={arrivalWindow} onChange={(e) => track(setArrivalWindow)(e.target.value.replace(/[^0-9]/g, ''))} inputMode="numeric" className={inputClass} />
              <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">Used by Scheduling whenever an individual job doesn&apos;t override it.</p>
            </Field>
            <Field label="Default Estimate Expiration (days)">
              <input value={estimateExpiration} onChange={(e) => track(setEstimateExpiration)(e.target.value.replace(/[^0-9]/g, ''))} inputMode="numeric" className={inputClass} />
            </Field>
            <Field label="Default Invoice Due (days)">
              <input value={invoiceDue} onChange={(e) => track(setInvoiceDue)(e.target.value.replace(/[^0-9]/g, ''))} inputMode="numeric" className={inputClass} />
              <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">Ready for the Invoices module — not used yet.</p>
            </Field>
            <Field label="Default Labor Rate ($/hr)">
              <input value={laborRate} onChange={(e) => track(setLaborRate)(e.target.value.replace(/[^0-9.]/g, ''))} inputMode="decimal" className={inputClass} />
              <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">Used in estimate profitability whenever an employee has no override rate.</p>
            </Field>
            <Field label="Currency">
              <select value={currency} onChange={(e) => track(setCurrency)(e.target.value)} className={inputClass}>
                <option value="USD">USD ($)</option>
                <option value="CAD">CAD ($)</option>
                <option value="AUD">AUD ($)</option>
              </select>
            </Field>
            <Field label="Measurement Units">
              <select value={measurementSystem} onChange={(e) => track(setMeasurementSystem)(e.target.value)} className={inputClass}>
                <option value="imperial">Imperial (sq ft, linear ft)</option>
                <option value="metric">Metric (sq m, linear m)</option>
              </select>
            </Field>
            <Field label="Distance Units">
              <select value={distanceUnit} onChange={(e) => track(setDistanceUnit)(e.target.value)} className={inputClass}>
                <option value="miles">Miles</option>
                <option value="km">Kilometers</option>
              </select>
            </Field>
          </div>
        </div>
      )}
    </SettingsSectionShell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</label>
      <div className="mt-1">{children}</div>
    </div>
  );
}
