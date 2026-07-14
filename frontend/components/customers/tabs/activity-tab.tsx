'use client';

import useSWR from 'swr';
import { customersApi } from '../../../lib/api/customers';
import { CardSkeleton, CardError, CardEmpty } from '../../dashboard/dashboard-card';

const TYPE_ICONS: Record<string, string> = {
  job: '🧽',
  estimate: '📋',
  invoice: '🧾',
  invoice_paid: '✅',
  payment: '💵',
  note: '📝',
};

export function ActivityTab({ customerId }: { customerId: string }) {
  const { data: events, error, isLoading } = useSWR([`activity`, customerId], () => customersApi.getActivity(customerId));

  if (isLoading) return <CardSkeleton lines={6} />;
  if (error) return <CardError />;
  if (!events || events.length === 0) return <CardEmpty message="No activity recorded yet." />;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <ol className="relative border-l border-slate-200 pl-5">
        {events.map((e) => (
          <li key={e.id} className="mb-4 last:mb-0">
            <span className="absolute -left-[9px] flex h-4 w-4 items-center justify-center rounded-full bg-white text-[10px]">
              {TYPE_ICONS[e.type] ?? '•'}
            </span>
            <p className="text-sm text-slate-700">{e.description}</p>
            <time className="text-xs text-slate-400">{new Date(e.occurredAt).toLocaleString()}</time>
          </li>
        ))}
      </ol>
    </div>
  );
}
