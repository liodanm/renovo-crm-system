import { Mail, Eye, CheckCircle2, XCircle, Briefcase, Clock } from 'lucide-react';
import type { TimelineEntry } from './StatusTimeline';
import type { EmailLogEntry } from '../../lib/api/estimates';

/**
 * Merges two already-existing logs into one customer-facing activity
 * feed — status_history (viewed/accepted/declined) and email_log (sent/
 * delivered/bounced). No new tracking table; this is a read-only,
 * client-side merge of data that already exists elsewhere for other
 * purposes (the Timeline card, the Email section's own history list).
 */
export function CustomerActivity({ statusHistory, emailHistory }: { statusHistory: TimelineEntry[]; emailHistory: EmailLogEntry[] }) {
  type ActivityItem = { at: string; icon: React.ReactNode; label: string };

  const fromStatus: ActivityItem[] = statusHistory
    .filter((e) => ['viewed', 'accepted', 'declined', 'expired'].includes(e.toStatus))
    .map((e) => ({
      at: e.changedAt,
      icon: e.toStatus === 'accepted' ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : e.toStatus === 'declined' ? <XCircle className="h-4 w-4 text-red-600" /> : e.toStatus === 'expired' ? <Clock className="h-4 w-4 text-orange-600" /> : <Eye className="h-4 w-4 text-purple-600" />,
      label: e.toStatus === 'viewed' ? 'Customer viewed the estimate' : e.toStatus === 'accepted' ? 'Customer accepted' : e.toStatus === 'expired' ? 'Estimate expired automatically' : 'Customer declined',
    }));

  const fromEmail: ActivityItem[] = emailHistory.map((e) => ({
    at: e.createdAt,
    icon: <Mail className="h-4 w-4 text-blue-600" />,
    label: `Estimate emailed to ${e.recipientEmail} (${e.status})`,
  }));

  const converted = statusHistory.filter((e) => e.note?.toLowerCase().includes('convert')).map((e) => ({
    at: e.changedAt,
    icon: <Briefcase className="h-4 w-4 text-emerald-800" />,
    label: 'Converted to Job',
  }));

  const items = [...fromStatus, ...fromEmail, ...converted].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  if (items.length === 0) {
    return <p className="text-sm text-slate-400">No customer activity yet.</p>;
  }

  return (
    <ul className="space-y-2.5">
      {items.map((item, i) => (
        <li key={i} className="flex items-start gap-2.5">
          <div className="mt-0.5">{item.icon}</div>
          <div>
            <p className="text-sm text-slate-700">{item.label}</p>
            <p className="text-xs text-slate-400">{new Date(item.at).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}
