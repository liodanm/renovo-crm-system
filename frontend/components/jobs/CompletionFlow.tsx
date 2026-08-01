'use client';

import { useState } from 'react';
import { SignaturePad } from './SignaturePad';
import { PhotoSection } from './PhotoSection';
import { ChemicalSection } from './ChemicalSection';
import { EquipmentSection } from './EquipmentSection';
import { SIGNATURE_UNAVAILABLE_LABELS, RECOMMENDABLE_SERVICE_LABELS, type CompleteJobInput } from '../../lib/api/jobs';
import { cn } from '../../lib/utils';

interface CompletionFlowProps {
  jobId: string;
  onSubmit: (input: CompleteJobInput) => Promise<void>;
  onCancel: () => void;
  isSubmitting: boolean;
}

type SignatureMode = 'sign' | 'unavailable';
type FieldOpsSection = 'photos' | 'chemicals' | 'equipment' | null;

export function CompletionFlow({ jobId, onSubmit, onCancel, isSubmitting }: CompletionFlowProps) {
  const [signatureMode, setSignatureMode] = useState<SignatureMode>('sign');
  const [signatureDataUrl, setSignatureDataUrl] = useState('');
  const [reason, setReason] = useState<keyof typeof SIGNATURE_UNAVAILABLE_LABELS>('customer_not_home');
  const [notes, setNotes] = useState('');
  const [recommended, setRecommended] = useState<string[]>([]);
  const [billableOverride, setBillableOverride] = useState('');
  // One at a time, collapsed by default — keeps the panel scrollable in
  // place on a small screen instead of showing all three full sections
  // (each with its own upload UI / lists) simultaneously.
  const [expandedSection, setExpandedSection] = useState<FieldOpsSection>(null);

  function toggleRecommended(service: string) {
    setRecommended((prev) => (prev.includes(service) ? prev.filter((s) => s !== service) : [...prev, service]));
  }

  async function handleSubmit() {
    await onSubmit({
      customerSignatureDataUrl: signatureMode === 'sign' && signatureDataUrl ? signatureDataUrl : undefined,
      signatureUnavailableReason: signatureMode === 'unavailable' ? reason : undefined,
      completionNotes: notes || undefined,
      recommendedFutureServices: recommended.length > 0 ? recommended : undefined,
      billableLaborHours: billableOverride ? Number(billableOverride) : undefined,
    });
  }

  return (
    <div className="mt-4 space-y-4 rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-slate-700">Complete This Job</h2>

      {/* Photos, Chemicals, and Equipment — the exact same sections that
          live further down this job's page, rendered inline here instead
          of linking away to them. Collapsed by default; expand one at a
          time so a tech can log what's needed without ever leaving this
          panel or scrolling to find it, then continue straight to
          signature below. Nothing about upload/add/delete behavior is
          different — same components, same functionality. */}
      <div className="space-y-2">
        <FieldOpsToggle label="📷 Photos" isOpen={expandedSection === 'photos'} onToggle={() => setExpandedSection((s) => (s === 'photos' ? null : 'photos'))} />
        {expandedSection === 'photos' && <PhotoSection jobId={jobId} />}

        <FieldOpsToggle label="🧪 Chemicals Used" isOpen={expandedSection === 'chemicals'} onToggle={() => setExpandedSection((s) => (s === 'chemicals' ? null : 'chemicals'))} />
        {expandedSection === 'chemicals' && <ChemicalSection jobId={jobId} />}

        <FieldOpsToggle label="🛠️ Equipment Used" isOpen={expandedSection === 'equipment'} onToggle={() => setExpandedSection((s) => (s === 'equipment' ? null : 'equipment'))} />
        {expandedSection === 'equipment' && <EquipmentSection jobId={jobId} />}
      </div>

      {/* Signature — genuinely optional, per explicit decision */}
      <div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setSignatureMode('sign')}
            className={cn('flex-1 rounded-lg px-3 py-2.5 text-sm font-medium', signatureMode === 'sign' ? 'bg-[var(--color-brand)] text-white' : 'bg-slate-100 text-slate-600')}
          >
            Get Signature
          </button>
          <button
            type="button"
            onClick={() => setSignatureMode('unavailable')}
            className={cn('flex-1 rounded-lg px-3 py-2.5 text-sm font-medium', signatureMode === 'unavailable' ? 'bg-[var(--color-brand)] text-white' : 'bg-slate-100 text-slate-600')}
          >
            Signature Unavailable
          </button>
        </div>

        {signatureMode === 'sign' ? (
          <div className="mt-3">
            <SignaturePad onCapture={setSignatureDataUrl} />
          </div>
        ) : (
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
            {(Object.keys(SIGNATURE_UNAVAILABLE_LABELS) as (keyof typeof SIGNATURE_UNAVAILABLE_LABELS)[]).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setReason(key)}
                className={cn('rounded-lg px-3 py-2.5 text-sm font-medium', reason === key ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600')}
              >
                {SIGNATURE_UNAVAILABLE_LABELS[key]}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Completion notes */}
      <div>
        <label className="text-xs font-medium text-slate-500">Completion Notes</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="What was done, anything the customer should know…"
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
        />
      </div>

      {/* Recommended future services — reuses the same Estimate service types */}
      <div>
        <label className="text-xs font-medium text-slate-500">Recommend for a Future Estimate</label>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {Object.entries(RECOMMENDABLE_SERVICE_LABELS).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => toggleRecommended(key)}
              className={cn(
                'rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
                recommended.includes(key) ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Billable hours override */}
      <div>
        <label className="text-xs font-medium text-slate-500">Billable Labor Hours (optional override)</label>
        <input
          type="text"
          inputMode="decimal"
          value={billableOverride}
          onChange={(e) => setBillableOverride(e.target.value.replace(/[^0-9.]/g, ''))}
          placeholder="Leave blank to use calculated time"
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
        />
      </div>

      <div className="flex gap-2 pt-1">
        <button
          onClick={handleSubmit}
          disabled={isSubmitting}
          className="flex-1 rounded-lg bg-emerald-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
        >
          {isSubmitting ? 'Completing…' : 'Confirm Complete'}
        </button>
        <button onClick={onCancel} className="rounded-lg border border-slate-300 px-4 py-3 text-sm font-medium text-slate-700">
          Cancel
        </button>
      </div>
    </div>
  );
}

function FieldOpsToggle({ label, isOpen, onToggle }: { label: string; isOpen: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        'flex w-full items-center justify-between rounded-lg px-3.5 py-3 text-sm font-medium transition-colors',
        isOpen ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
      )}
    >
      <span>{label}</span>
      <span className="text-xs">{isOpen ? '▲ Close' : '▼ Add / View'}</span>
    </button>
  );
}
