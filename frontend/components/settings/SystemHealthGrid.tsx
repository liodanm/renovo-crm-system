'use client';

import { CheckCircle2, AlertTriangle, HelpCircle, Circle } from 'lucide-react';
import type { SystemHealth } from '../../lib/api/settings';

type Tone = 'healthy' | 'warning' | 'unknown' | 'neutral';

function toneFor(status: string): Tone {
  if (['healthy', 'configured', 'ran'].includes(status)) return 'healthy';
  if (['unhealthy', 'not_configured', 'no_runs_yet'].includes(status)) return 'warning';
  if (status === 'unknown') return 'unknown';
  return 'neutral';
}

const TONE_STYLES: Record<Tone, { chip: string; icon: JSX.Element }> = {
  healthy: { chip: 'bg-emerald-50 text-emerald-700', icon: <CheckCircle2 className="h-3.5 w-3.5" /> },
  warning: { chip: 'bg-amber-50 text-amber-700', icon: <AlertTriangle className="h-3.5 w-3.5" /> },
  unknown: { chip: 'bg-slate-100 text-slate-500', icon: <HelpCircle className="h-3.5 w-3.5" /> },
  neutral: { chip: 'bg-slate-100 text-slate-600', icon: <Circle className="h-3.5 w-3.5" /> },
};

function labelFor(status: string): string {
  const map: Record<string, string> = {
    healthy: 'Healthy',
    unhealthy: 'Unhealthy',
    configured: 'Configured',
    not_configured: 'Not Configured',
    ran: 'Ran',
    no_runs_yet: 'No Runs Yet',
    unknown: 'Unknown',
  };
  return map[status] ?? status;
}

function Cell({ title, status, sub }: { title: string; status: string; sub?: string }) {
  const tone = toneFor(status);
  const style = TONE_STYLES[tone];
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <p className="text-xs font-medium text-slate-500">{title}</p>
      <div className={`mt-1.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${style.chip}`}>
        {style.icon}
        {labelFor(status)}
      </div>
      {sub && <p className="mt-1 text-[11px] text-slate-400">{sub}</p>}
    </div>
  );
}

/** Plain info cells (Environment, Version) — these aren't a health check, so no colored chip/verdict, just the value. */
function PlainCell({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <p className="text-xs font-medium text-slate-500">{title}</p>
      <p className="mt-1.5 text-sm font-medium text-slate-700">{value}</p>
    </div>
  );
}

export function SystemHealthGrid({ health }: { health: SystemHealth }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-slate-700">System Health</h2>
      <p className="mt-1 text-xs text-slate-500">Real checks where possible. Anything this app genuinely can't determine is shown as Unknown, not guessed.</p>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        <Cell title="Database" status={health.database.status} />
        <Cell title="Redis" status={health.redis.status} />
        <Cell title="Email (Postmark)" status={health.email.status} />
        <Cell title="SMS (Twilio)" status={health.sms.status} />
        <Cell title="Payments (Stripe)" status={health.payments.status} />
        <Cell title="AI (Anthropic)" status={health.ai.status} />
        <Cell title="Storage (S3)" status={health.storage.status} />
        <Cell title="Automation" status={health.automation.status} sub={health.automation.lastRunAt ? `Last run ${new Date(health.automation.lastRunAt).toLocaleString()}` : undefined} />
        <PlainCell title="Environment" value={health.environment.value} />
        <PlainCell title="Version" value={health.version.value} />
        <Cell title="Last Backup" status={health.lastBackup.status} sub={health.lastBackup.note} />
        <Cell title="Railway Status" status={health.railwayStatus.status} sub={health.railwayStatus.note} />
      </div>
    </div>
  );
}
