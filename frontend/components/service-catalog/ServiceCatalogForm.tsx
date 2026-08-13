'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2 } from 'lucide-react';
import { serviceCatalogApi, SERVICE_TYPE_LABELS, UNIT_LABELS, type ServiceCatalogItem, type CatalogChemical, type CatalogEquipment } from '../../lib/api/service-catalog';
import { ApiError } from '../../lib/api/api-client';

const SERVICE_TYPES = Object.keys(SERVICE_TYPE_LABELS);
const UNITS = Object.keys(UNIT_LABELS);
const CHEMICAL_UNITS = ['oz', 'gallons', 'liters', 'ml', 'lbs', 'kg'];

interface ServiceCatalogFormProps {
  existing?: ServiceCatalogItem;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
      <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">{title}</h2>
      <div className="mt-3 space-y-3">{children}</div>
    </div>
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

const inputClass = 'w-full rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-3 text-base lg:py-2 lg:text-sm dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-400 dark:disabled:bg-slate-800 dark:disabled:text-slate-500';

export function ServiceCatalogForm({ existing }: ServiceCatalogFormProps) {
  const router = useRouter();
  const [name, setName] = useState(existing?.name ?? '');
  const [serviceType, setServiceType] = useState(existing?.serviceType ?? 'other');
  const [category, setCategory] = useState(existing?.category ?? '');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [isActive, setIsActive] = useState(existing?.isActive ?? true);

  const [defaultUnitOfMeasure, setDefaultUnitOfMeasure] = useState(existing?.defaultUnitOfMeasure ?? 'sq_ft');
  const [defaultUnitPrice, setDefaultUnitPrice] = useState(existing?.defaultUnitPrice ?? '');
  const [minimumPrice, setMinimumPrice] = useState(existing?.minimumPrice ?? '');
  const [defaultLaborHours, setDefaultLaborHours] = useState(existing?.defaultLaborHours ?? '');
  const [estimatedDurationMinutes, setEstimatedDurationMinutes] = useState(existing?.estimatedDurationMinutes?.toString() ?? '');

  const [chemicals, setChemicals] = useState<CatalogChemical[]>(existing?.defaultChemicals ?? []);
  const [defaultEquipment, setDefaultEquipment] = useState<CatalogEquipment[]>(existing?.defaultEquipment ?? []);
  const [requiredEquipment, setRequiredEquipment] = useState<CatalogEquipment[]>(existing?.requiredEquipment ?? []);

  const [warrantyDays, setWarrantyDays] = useState(existing?.warrantyDays?.toString() ?? '');
  const [warrantyTerms, setWarrantyTerms] = useState(existing?.warrantyTerms ?? '');
  const [preparationInstructions, setPreparationInstructions] = useState(existing?.preparationInstructions ?? '');
  const [aftercareInstructions, setAftercareInstructions] = useState(existing?.aftercareInstructions ?? '');

  const [defaultNotes, setDefaultNotes] = useState(existing?.defaultNotes ?? '');
  const [defaultTerms, setDefaultTerms] = useState(existing?.defaultTerms ?? '');

  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateChemical(i: number, patch: Partial<CatalogChemical>) {
    setChemicals((prev) => prev.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  }
  function updateEquipment(list: CatalogEquipment[], setList: (v: CatalogEquipment[]) => void, i: number, patch: Partial<CatalogEquipment>) {
    setList(list.map((e, idx) => (idx === i ? { ...e, ...patch } : e)));
  }

  async function handleSave() {
    if (!name.trim()) {
      setError('Service name is required.');
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      const payload = {
        name: name.trim(),
        serviceType,
        category: category || undefined,
        description: description || undefined,
        isActive,
        defaultUnitOfMeasure,
        defaultUnitPrice: defaultUnitPrice ? Number(defaultUnitPrice) : undefined,
        minimumPrice: minimumPrice ? Number(minimumPrice) : undefined,
        defaultLaborHours: defaultLaborHours ? Number(defaultLaborHours) : undefined,
        estimatedDurationMinutes: estimatedDurationMinutes ? Number(estimatedDurationMinutes) : undefined,
        defaultChemicals: chemicals.filter((c) => c.chemicalName.trim()),
        defaultEquipment: defaultEquipment.filter((e) => e.equipmentName.trim()),
        requiredEquipment: requiredEquipment.filter((e) => e.equipmentName.trim()),
        warrantyDays: warrantyDays ? Number(warrantyDays) : undefined,
        warrantyTerms: warrantyTerms || undefined,
        preparationInstructions: preparationInstructions || undefined,
        aftercareInstructions: aftercareInstructions || undefined,
        defaultNotes: defaultNotes || undefined,
        defaultTerms: defaultTerms || undefined,
      };
      if (existing) {
        await serviceCatalogApi.update(existing.id, payload);
      } else {
        await serviceCatalogApi.create(payload);
      }
      router.push('/service-catalog');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong saving this service.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      {error && <div className="rounded-lg bg-red-50 dark:bg-red-950 px-4 py-3 text-sm text-red-700 dark:text-red-300">{error}</div>}

      <Section title="General">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Service Name">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Roof Soft Wash" className={inputClass} />
          </Field>
          <Field label="Service Type">
            <select value={serviceType} onChange={(e) => setServiceType(e.target.value)} className={inputClass}>
              {SERVICE_TYPES.map((t) => (
                <option key={t} value={t}>{SERVICE_TYPE_LABELS[t]}</option>
              ))}
            </select>
          </Field>
          <Field label="Category">
            <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g. Roof Services" className={inputClass} />
          </Field>
          <Field label="Status">
            <label className="flex items-center gap-2 py-2 text-sm">
              <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="rounded border-slate-300 dark:border-slate-700" />
              Active
            </label>
          </Field>
        </div>
        <Field label="Description">
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className={inputClass} />
        </Field>
      </Section>

      <Section title="Pricing">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="Default Unit">
            <select value={defaultUnitOfMeasure} onChange={(e) => setDefaultUnitOfMeasure(e.target.value)} className={inputClass}>
              {UNITS.map((u) => (
                <option key={u} value={u}>{UNIT_LABELS[u]}</option>
              ))}
            </select>
          </Field>
          <Field label="Default Unit Price ($)">
            <input value={defaultUnitPrice} onChange={(e) => setDefaultUnitPrice(e.target.value.replace(/[^0-9.]/g, ''))} inputMode="decimal" className={inputClass} />
          </Field>
          <Field label="Minimum Price ($)">
            <input value={minimumPrice} onChange={(e) => setMinimumPrice(e.target.value.replace(/[^0-9.]/g, ''))} inputMode="decimal" className={inputClass} />
          </Field>
          <Field label="Default Labor Hours">
            <input value={defaultLaborHours} onChange={(e) => setDefaultLaborHours(e.target.value.replace(/[^0-9.]/g, ''))} inputMode="decimal" className={inputClass} />
          </Field>
        </div>
        <Field label="Estimated Duration (minutes)">
          <input value={estimatedDurationMinutes} onChange={(e) => setEstimatedDurationMinutes(e.target.value.replace(/[^0-9]/g, ''))} inputMode="numeric" className="w-40 rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-3 text-base lg:py-2 lg:text-sm dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-400" />
        </Field>
      </Section>

      <Section title="Chemicals">
        {chemicals.map((c, i) => (
          <div key={i} className="grid grid-cols-[1fr_auto_auto_auto_auto] items-center gap-2">
            <input value={c.chemicalName} onChange={(e) => updateChemical(i, { chemicalName: e.target.value })} placeholder="Chemical name" className={inputClass} />
            <input value={c.mixRatio ?? ''} onChange={(e) => updateChemical(i, { mixRatio: e.target.value })} placeholder="Mix ratio" className="w-24 rounded-lg border border-slate-300 dark:border-slate-700 px-2 py-3 text-base lg:py-2 lg:text-sm dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-400" />
            <input value={c.quantity ?? ''} onChange={(e) => updateChemical(i, { quantity: Number(e.target.value.replace(/[^0-9.]/g, '')) })} placeholder="Qty" inputMode="decimal" className="w-16 rounded-lg border border-slate-300 dark:border-slate-700 px-2 py-3 text-base lg:py-2 lg:text-sm dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-400" />
            <select value={c.unit ?? 'oz'} onChange={(e) => updateChemical(i, { unit: e.target.value })} className="rounded-lg border border-slate-300 dark:border-slate-700 px-1 py-3 text-base lg:py-2 lg:text-sm dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-400">
              {CHEMICAL_UNITS.map((u) => (
                <option key={u} value={u}>{u}</option>
              ))}
            </select>
            <button onClick={() => setChemicals((prev) => prev.filter((_, idx) => idx !== i))} className="rounded-lg p-2 text-slate-400 dark:text-slate-500 hover:bg-red-50 dark:bg-red-950 hover:text-red-600 dark:text-red-400">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
        <button onClick={() => setChemicals((prev) => [...prev, { chemicalName: '' }])} className="flex items-center gap-1.5 text-sm font-medium text-[var(--color-brand)]">
          <Plus className="h-4 w-4" /> Add Chemical
        </button>
      </Section>

      <Section title="Equipment">
        <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Default (typical/suggested)</p>
        {defaultEquipment.map((eq, i) => (
          <div key={i} className="flex items-center gap-2">
            <input value={eq.equipmentName} onChange={(e) => updateEquipment(defaultEquipment, setDefaultEquipment, i, { equipmentName: e.target.value })} placeholder="Equipment name" className={inputClass} />
            <button onClick={() => setDefaultEquipment((prev) => prev.filter((_, idx) => idx !== i))} className="rounded-lg p-2 text-slate-400 dark:text-slate-500 hover:bg-red-50 dark:bg-red-950 hover:text-red-600 dark:text-red-400">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
        <button onClick={() => setDefaultEquipment((prev) => [...prev, { equipmentName: '' }])} className="flex items-center gap-1.5 text-sm font-medium text-[var(--color-brand)]">
          <Plus className="h-4 w-4" /> Add Default Equipment
        </button>

        <p className="pt-2 text-xs font-medium text-slate-500 dark:text-slate-400">Required (job can't be done without it)</p>
        {requiredEquipment.map((eq, i) => (
          <div key={i} className="flex items-center gap-2">
            <input value={eq.equipmentName} onChange={(e) => updateEquipment(requiredEquipment, setRequiredEquipment, i, { equipmentName: e.target.value })} placeholder="Equipment name" className={inputClass} />
            <button onClick={() => setRequiredEquipment((prev) => prev.filter((_, idx) => idx !== i))} className="rounded-lg p-2 text-slate-400 dark:text-slate-500 hover:bg-red-50 dark:bg-red-950 hover:text-red-600 dark:text-red-400">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
        <button onClick={() => setRequiredEquipment((prev) => [...prev, { equipmentName: '' }])} className="flex items-center gap-1.5 text-sm font-medium text-[var(--color-brand)]">
          <Plus className="h-4 w-4" /> Add Required Equipment
        </button>
      </Section>

      <Section title="Customer Information">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Warranty Period (days)">
            <input value={warrantyDays} onChange={(e) => setWarrantyDays(e.target.value.replace(/[^0-9]/g, ''))} inputMode="numeric" className={inputClass} />
          </Field>
          <Field label="Warranty Terms">
            <input value={warrantyTerms} onChange={(e) => setWarrantyTerms(e.target.value)} className={inputClass} />
          </Field>
        </div>
        <Field label="Preparation Instructions (shown to customer before the job)">
          <textarea value={preparationInstructions} onChange={(e) => setPreparationInstructions(e.target.value)} rows={2} className={inputClass} />
        </Field>
        <Field label="After-Care Instructions (shown to customer after completion)">
          <textarea value={aftercareInstructions} onChange={(e) => setAftercareInstructions(e.target.value)} rows={2} className={inputClass} />
        </Field>
      </Section>

      <Section title="Estimating">
        <Field label="Default Notes (pre-fills new estimate line items)">
          <textarea value={defaultNotes} onChange={(e) => setDefaultNotes(e.target.value)} rows={2} className={inputClass} />
        </Field>
        <Field label="Default Terms">
          <textarea value={defaultTerms} onChange={(e) => setDefaultTerms(e.target.value)} rows={2} className={inputClass} />
        </Field>
        <p className="text-xs text-slate-400 dark:text-slate-500">Suggested upsells and future services can be set once more services exist to choose from.</p>
      </Section>

      <div className="flex gap-2">
        <button onClick={handleSave} disabled={isSaving} className="rounded-lg bg-[var(--color-brand)] px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50">
          {isSaving ? 'Saving…' : existing ? 'Save Changes' : 'Create Service'}
        </button>
        <button onClick={() => router.push('/service-catalog')} className="rounded-lg border border-slate-300 dark:border-slate-700 px-5 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-300">
          Cancel
        </button>
      </div>
    </div>
  );
}
