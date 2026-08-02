'use client';

import { useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { customersApi, CustomerProfile } from '../../../lib/api/customers';
import { CardSkeleton } from '../../dashboard/dashboard-card';

function formatMoney(value: string | number): string {
  return `$${Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function OverviewTab({ customer, onUpdated }: { customer: CustomerProfile; onUpdated: () => void }) {
  const { data: customFields, isLoading } = useSWR(
    [`custom-fields`, customer.id],
    () => customersApi.getCustomFieldValues(customer.id),
  );
  const [isEditingTags, setIsEditingTags] = useState(false);
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState(customer.tags);
  const [savingTags, setSavingTags] = useState(false);

  async function saveTags(nextTags: string[]) {
    setSavingTags(true);
    try {
      await customersApi.update(customer.id, { tags: nextTags });
      setTags(nextTags);
      onUpdated();
    } finally {
      setSavingTags(false);
    }
  }

  function addTag() {
    const value = tagInput.trim();
    if (value && !tags.includes(value)) {
      saveTags([...tags, value]);
    }
    setTagInput('');
  }

  function removeTag(tag: string) {
    saveTags(tags.filter((t) => t !== tag));
  }

  const hasBalance = Number(customer.balanceDue) > 0;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {/* Money at a glance — the whole reason this card exists is so a call
          coming in doesn't require a separate trip to Invoices/Estimates
          just to answer "does this person owe me anything." */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm lg:col-span-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-slate-800">Money at a Glance</h3>
          <Link
            href={`/estimates/new?customerId=${customer.id}`}
            className="rounded-lg bg-[var(--color-brand)] px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90"
          >
            + New Estimate
          </Link>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-3">
          <div>
            <p className="text-xs text-slate-400">Balance Due</p>
            <p className={`mt-0.5 text-lg font-semibold ${hasBalance ? 'text-red-600' : 'text-slate-900'}`}>{formatMoney(customer.balanceDue)}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400">Open Estimates</p>
            <p className="mt-0.5 text-lg font-semibold text-slate-900">{customer.openEstimatesCount}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400">Open Invoices</p>
            <p className="mt-0.5 text-lg font-semibold text-slate-900">{customer.openInvoicesCount}</p>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-800">Contact Information</h3>
        <dl className="mt-3 space-y-2 text-sm">
          <PhoneRow label="Phone" value={customer.phone} />
          <PhoneRow label="Secondary phone" value={customer.secondaryPhone} />
          <Row label="Email" value={customer.email} />
          <Row label="Source" value={customer.source} />
          <Row label="Lead status" value={customer.leadStatus} capitalize />
        </dl>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-800">Tags</h3>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <span key={tag} className="flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-700">
              {tag}
              <button onClick={() => removeTag(tag)} disabled={savingTags} className="text-slate-400 hover:text-slate-700">
                ×
              </button>
            </span>
          ))}
          {isEditingTags ? (
            <input
              autoFocus
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addTag();
                }
              }}
              onBlur={() => {
                addTag();
                setIsEditingTags(false);
              }}
              placeholder="Add tag…"
              className="w-24 rounded-full border border-slate-300 px-2.5 py-1.5 text-base focus:border-[var(--color-brand)] focus:outline-none lg:py-1 lg:text-xs"
            />
          ) : (
            <button
              onClick={() => setIsEditingTags(true)}
              className="rounded-full border border-dashed border-slate-300 px-2.5 py-1 text-xs text-slate-500 hover:border-slate-400"
            >
              + Add tag
            </button>
          )}
        </div>
      </div>

      {customer.notesText && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm lg:col-span-2">
          <h3 className="text-sm font-semibold text-slate-800">General Notes</h3>
          <p className="mt-2 whitespace-pre-wrap text-sm text-slate-600">{customer.notesText}</p>
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm lg:col-span-2">
        <h3 className="text-sm font-semibold text-slate-800">Custom Fields</h3>
        {isLoading && (
          <div className="mt-3">
            <CardSkeleton lines={2} />
          </div>
        )}
        {!isLoading && customFields && customFields.length === 0 && (
          <p className="mt-2 text-sm text-slate-400">
            No custom fields defined yet. Custom fields are configured in Settings and let you track things specific to your
            business, like gate codes or preferred contact times.
          </p>
        )}
        {!isLoading && customFields && customFields.length > 0 && (
          <dl className="mt-3 grid grid-cols-2 gap-3">
            {customFields.map((f) => (
              <div key={f.fieldKey}>
                <dt className="text-xs text-slate-400">{f.label}</dt>
                <dd className="text-sm text-slate-700">{String(f.value ?? '—')}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </div>
  );
}

function Row({ label, value, capitalize }: { label: string; value: string | null; capitalize?: boolean }) {
  return (
    <div className="flex justify-between">
      <dt className="text-slate-400">{label}</dt>
      <dd className={`text-slate-700 ${capitalize ? 'capitalize' : ''}`}>{value || '—'}</dd>
    </div>
  );
}

function PhoneRow({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex justify-between">
      <dt className="text-slate-400">{label}</dt>
      <dd>
        {value ? (
          <a href={`tel:${value}`} className="font-medium text-[var(--color-brand)]">
            {value}
          </a>
        ) : (
          <span className="text-slate-700">—</span>
        )}
      </dd>
    </div>
  );
}
