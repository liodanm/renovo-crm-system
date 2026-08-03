'use client';

import { useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { customersApi } from '../../../lib/api/customers';
import { CardSkeleton, CardError, CardEmpty } from '../../../components/dashboard/dashboard-card';
import { AppShell } from '../../../components/layout/AppShell';

const REASON_LABELS: Record<string, string> = {
  exact_email: 'Same email address',
  exact_phone: 'Same phone number',
  similar_name: 'Similar name',
};

export default function DuplicatesPage() {
  const { data, error, isLoading, mutate } = useSWR('customer-duplicates', customersApi.scanDuplicates);
  const [mergingKey, setMergingKey] = useState<string | null>(null);
  const [mergeError, setMergeError] = useState<string | null>(null);

  async function handleMerge(canonicalId: string, duplicateId: string) {
    const key = `${canonicalId}-${duplicateId}`;
    setMergingKey(key);
    setMergeError(null);
    try {
      await customersApi.merge(canonicalId, duplicateId);
      mutate();
    } catch {
      setMergeError('Could not merge these customers. Please try again.');
    } finally {
      setMergingKey(null);
    }
  }

  return (
    <AppShell>
      <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6 lg:py-8">
        <Link href="/customers" className="text-sm font-medium text-slate-500 hover:text-slate-800">
          ← Customers
        </Link>
        <h1 className="text-xl font-semibold text-slate-900">Possible Duplicate Customers</h1>
        <p className="mt-1 text-sm text-slate-500">
          Found by matching exact email, exact phone, or similar names across your customer list. Merging is permanent — the
          customer you keep absorbs all jobs, invoices, notes, and files from the one you merge away.
        </p>

        {mergeError && <div className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{mergeError}</div>}

        <div className="mt-6 space-y-4">
          {isLoading && <CardSkeleton lines={6} />}
          {error && <CardError />}
          {!isLoading && !error && data && data.length === 0 && (
            <CardEmpty message="No likely duplicates found. Nice and clean!" />
          )}

          {!isLoading &&
            !error &&
            data?.map((cluster, i) => (
              <div key={i} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="mb-3 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                  {REASON_LABELS[cluster.reason]}
                </div>
                <div className="space-y-2">
                  {cluster.customers.map((c) => (
                    <div key={c.id} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2">
                      <div>
                        <Link href={`/customers/${c.id}`} className="text-sm font-medium text-slate-900 hover:text-[var(--color-brand)]">
                          {c.displayName}
                        </Link>
                        <div className="text-xs text-slate-400">
                          {c.email ?? '—'} {c.phone ? `· ${c.phone}` : ''}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        {cluster.customers
                          .filter((other) => other.id !== c.id)
                          .map((other) => (
                            <button
                              key={other.id}
                              disabled={mergingKey === `${c.id}-${other.id}`}
                              onClick={() => handleMerge(c.id, other.id)}
                              className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50"
                              title={`Keep "${c.displayName}" and merge "${other.displayName}" into it`}
                            >
                              {mergingKey === `${c.id}-${other.id}` ? 'Merging…' : `Keep this, merge other in`}
                            </button>
                          ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
        </div>
      </main>
    </AppShell>
  );
}
