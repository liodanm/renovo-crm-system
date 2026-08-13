'use client';

import { useParams } from 'next/navigation';
import useSWR from 'swr';
import { estimatesApi } from '../../../../lib/api/estimates';
import { EstimateForm } from '../../../../components/estimates/EstimateForm';
import { AppShell } from '../../../../components/layout/AppShell';

export default function EditEstimatePage() {
  const params = useParams<{ id: string }>();
  const { data: estimate, error, isLoading } = useSWR(['estimate-for-edit', params.id], () => estimatesApi.get(params.id));

  if (isLoading) {
    return (
      <AppShell>
        <main className="mx-auto max-w-4xl px-4 py-6">
          <p className="text-sm text-slate-500 dark:text-slate-400">Loading…</p>
        </main>
      </AppShell>
    );
  }

  if (error || !estimate) {
    return (
      <AppShell>
        <main className="mx-auto max-w-4xl px-4 py-6">
          <p className="text-sm text-red-600 dark:text-red-400">Couldn't load this estimate.</p>
        </main>
      </AppShell>
    );
  }

  // The backend's own update() already rejects a non-draft edit with a
  // real error — this is a friendlier, earlier version of the same rule,
  // not a second copy of it.
  if (estimate.status !== 'draft') {
    return (
      <AppShell>
        <main className="mx-auto max-w-4xl px-4 py-6">
          <p className="text-sm text-amber-700 dark:text-amber-300">
            This estimate is <strong>{estimate.status}</strong> and can no longer be edited directly.
            {estimate.status === 'accepted' && ' An Owner or Admin can reopen it from the estimate page first.'}
          </p>
        </main>
      </AppShell>
    );
  }

  return <EstimateForm existingEstimate={estimate} />;
}
