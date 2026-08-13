'use client';

import { useParams } from 'next/navigation';
import { Construction } from 'lucide-react';
import { findSettingsNavItem } from '../../../lib/settings-nav-config';

export default function SettingsPlaceholderPage() {
  const params = useParams<{ section: string }>();
  const item = findSettingsNavItem(params.section);

  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-6 py-20 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800">
        <Construction className="h-6 w-6 text-slate-400 dark:text-slate-500" />
      </div>
      <h1 className="mt-4 text-lg font-semibold text-slate-900 dark:text-slate-100">{item?.label ?? 'Coming Soon'}</h1>
      <p className="mt-1.5 max-w-sm text-sm text-slate-500 dark:text-slate-400">{item?.description ?? "This section isn't available yet."}</p>
      <span className="mt-4 rounded-full bg-slate-100 dark:bg-slate-800 px-3 py-1 text-xs font-medium text-slate-500 dark:text-slate-400">Coming Soon</span>
    </div>
  );
}
