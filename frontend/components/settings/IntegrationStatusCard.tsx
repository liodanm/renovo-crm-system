import { CheckCircle2, AlertTriangle } from 'lucide-react';
import type { IntegrationStatus } from '../../lib/api/settings';

/** One shared status display, reused by Payment/Email/SMS/Storage settings — every real secret lives in an environment variable, never edited here. */
export function IntegrationStatusCard({ status }: { status: IntegrationStatus }) {
  return (
    <div className={`rounded-xl border p-4 ${status.configured ? 'border-emerald-200 bg-emerald-50 dark:bg-emerald-950' : 'border-amber-200 bg-amber-50 dark:bg-amber-950'}`}>
      <div className="flex items-start gap-3">
        {status.configured ? <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" /> : <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />}
        <div>
          <p className="text-sm font-semibold text-slate-800">{status.name} {status.configured ? 'is connected' : 'is not configured'}</p>
          <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">{status.feature}</p>
          {!status.configured && (
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Set these in your Railway environment variables: <code className="rounded bg-white dark:bg-slate-900 px-1 py-0.5">{status.missingVars.join(', ')}</code>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
