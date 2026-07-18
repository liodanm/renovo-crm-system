'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Trash2, Plus } from 'lucide-react';
import { jobsApi } from '../../lib/api/jobs';
import { useGeolocation } from '../../lib/hooks/use-geolocation';

const UNITS = ['oz', 'gallons', 'liters', 'ml', 'lbs', 'kg'];

export function ChemicalSection({ jobId }: { jobId: string }) {
  const { data: usage, mutate } = useSWR(['job-chemicals', jobId], () => jobsApi.listChemicals(jobId));
  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState('');
  const [unit, setUnit] = useState('oz');
  const [isSaving, setIsSaving] = useState(false);
  const { capture } = useGeolocation();

  async function handleAdd() {
    if (!name.trim() || !quantity || Number(quantity) <= 0) return;
    setIsSaving(true);
    try {
      const gps = await capture();
      await jobsApi.addChemical(jobId, { chemicalName: name.trim(), quantity: Number(quantity), unit, ...gps });
      setName('');
      setQuantity('');
      await mutate();
    } finally {
      setIsSaving(false);
    }
  }

  async function handleRemove(id: string) {
    const gps = await capture();
    await jobsApi.removeChemical(jobId, id, gps);
    mutate();
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-slate-700">Chemical Usage</h2>

      <div className="mt-3 space-y-2">
        {(usage ?? []).map((item) => (
          <div key={item.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2.5">
            <div>
              <p className="text-sm font-medium text-slate-800">{item.chemicalName}</p>
              <p className="text-xs text-slate-500">{item.quantity} {item.unit}{item.notes ? ` · ${item.notes}` : ''}</p>
            </div>
            <button onClick={() => handleRemove(item.id)} className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label={`Remove ${item.chemicalName}`}>
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
        {usage && usage.length === 0 && <p className="text-xs text-slate-400">No chemicals logged yet.</p>}
      </div>

      {/* Quick-add — big touch targets, minimal fields */}
      <div className="mt-3 grid grid-cols-[1fr_auto_auto] gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Chemical name"
          className="rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
        />
        <input
          type="text"
          inputMode="decimal"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value.replace(/[^0-9.]/g, ''))}
          placeholder="Qty"
          className="w-20 rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
        />
        <select value={unit} onChange={(e) => setUnit(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-2.5 text-sm">
          {UNITS.map((u) => (
            <option key={u} value={u}>{u}</option>
          ))}
        </select>
      </div>
      <button
        onClick={handleAdd}
        disabled={isSaving || !name.trim() || !quantity}
        className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg bg-slate-800 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-40"
      >
        <Plus className="h-4 w-4" /> Add Chemical
      </button>
    </div>
  );
}
