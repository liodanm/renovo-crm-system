'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Trash2, Plus } from 'lucide-react';
import { jobsApi } from '../../lib/api/jobs';
import { useGeolocation } from '../../lib/hooks/use-geolocation';

export function EquipmentSection({ jobId }: { jobId: string }) {
  const { data: usage, mutate } = useSWR(['job-equipment', jobId], () => jobsApi.listEquipment(jobId));
  const [name, setName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const { capture } = useGeolocation();

  async function handleAdd() {
    if (!name.trim()) return;
    setIsSaving(true);
    try {
      const gps = await capture();
      await jobsApi.addEquipment(jobId, { equipmentName: name.trim(), ...gps });
      setName('');
      await mutate();
    } finally {
      setIsSaving(false);
    }
  }

  async function handleRemove(id: string) {
    const gps = await capture();
    await jobsApi.removeEquipment(jobId, id, gps);
    mutate();
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-slate-700">Equipment Used</h2>

      <div className="mt-3 space-y-2">
        {(usage ?? []).map((item) => (
          <div key={item.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2.5">
            <p className="text-sm font-medium text-slate-800">{item.equipmentName}</p>
            <button onClick={() => handleRemove(item.id)} className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label={`Remove ${item.equipmentName}`}>
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
        {usage && usage.length === 0 && <p className="text-xs text-slate-400">No equipment logged yet.</p>}
      </div>

      <div className="mt-3 flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Equipment name"
          className="flex-1 rounded-lg border border-slate-300 px-3 py-3 text-base lg:py-2.5 lg:text-sm"
        />
        <button
          onClick={handleAdd}
          disabled={isSaving || !name.trim()}
          className="flex items-center gap-1.5 rounded-lg bg-slate-800 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-40"
        >
          <Plus className="h-4 w-4" /> Add
        </button>
      </div>
    </div>
  );
}
