'use client';

import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { Zap } from 'lucide-react';
import { automationApi, AUTOMATION_RULES, type AutomationSettings, type AutomationTemplate } from '../../../lib/api/automation';
import { SettingsSectionShell } from '../../../components/settings/SettingsSectionShell';
import { ApiError } from '../../../lib/api/api-client';

// Maps each rule to which settings-object fields control it — one shared
// table the render logic below reads from, rather than a hand-written
// if/else per rule for enable + timing.
const RULE_FIELD_MAP: Record<string, { enabledKey: keyof AutomationSettings; timingKey?: keyof AutomationSettings; timingLabel?: string; timingSuffix?: string }> = {
  estimate_followup: { enabledKey: 'estimateFollowupEnabled', timingKey: 'estimateFollowupAfterDays', timingLabel: 'Send after', timingSuffix: 'days with no response' },
  estimate_expiration_reminder: { enabledKey: 'estimateExpirationReminderEnabled', timingKey: 'estimateExpirationReminderDaysBefore', timingLabel: 'Send', timingSuffix: 'days before it expires' },
  recurring_reminder: { enabledKey: 'recurringReminderEnabled', timingKey: 'recurringReminderIntervalMonths', timingLabel: 'Remind after', timingSuffix: 'months since last service' },
  job_thank_you: { enabledKey: 'jobThankYouEnabled' },
  review_request: { enabledKey: 'reviewRequestEnabled', timingKey: 'reviewRequestDelayDays', timingLabel: 'Send', timingSuffix: 'days after completion' },
  payment_reminder: { enabledKey: 'paymentReminderEnabled', timingKey: 'paymentReminderDaysAfterDue', timingLabel: 'Send', timingSuffix: 'days after the due date' },
};

export default function AutomationSettingsPage() {
  const { data, mutate } = useSWR('automation-settings', () => automationApi.getSettings());
  const [draft, setDraft] = useState<AutomationSettings | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedTemplate, setExpandedTemplate] = useState<string | null>(null);
  const [runNowResult, setRunNowResult] = useState<string | null>(null);

  useEffect(() => {
    if (data) {
      setDraft(data);
      setHasChanges(false);
    }
  }, [data]);

  function updateField<K extends keyof AutomationSettings>(key: K, value: AutomationSettings[K]) {
    setDraft((d) => (d ? { ...d, [key]: value } : d));
    setHasChanges(true);
  }

  function updateTemplate(ruleKey: string, patch: Partial<AutomationTemplate>) {
    setDraft((d) => (d ? { ...d, templates: { ...d.templates, [ruleKey]: { ...d.templates[ruleKey], ...patch } } } : d));
    setHasChanges(true);
  }

  async function handleSave() {
    if (!draft) return;
    setIsSaving(true);
    setError(null);
    try {
      await automationApi.updateSettings(draft);
      await mutate();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong.');
    } finally {
      setIsSaving(false);
    }
  }

  function handleCancel() {
    if (data) setDraft(data);
    setHasChanges(false);
  }

  async function handleRunNow() {
    setRunNowResult('Running…');
    try {
      const result = await automationApi.runNow();
      setRunNowResult(`Sent ${result.sent}, failed ${result.failed}.`);
    } catch (err) {
      setRunNowResult(err instanceof ApiError ? err.message : 'Could not run automation.');
    }
  }

  return (
    <SettingsSectionShell title="Automation" description="Automatic follow-ups, reminders, and thank-yous — configured here, no code required." hasUnsavedChanges={hasChanges} isSaving={isSaving} error={error} onSave={handleSave} onCancel={handleCancel}>
      {!draft ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : (
        <>
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-slate-700">Runs automatically, once a day</h2>
                <p className="mt-1 text-xs text-slate-500">Every rule below runs on its own daily schedule — nothing to trigger manually. Use this only to test a change right now instead of waiting.</p>
              </div>
              <button onClick={handleRunNow} className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">
                <Zap className="h-3.5 w-3.5" /> Run Now
              </button>
            </div>
            {runNowResult && <p className="mt-2 text-xs text-slate-500">{runNowResult}</p>}
          </div>

          {AUTOMATION_RULES.map((rule) => {
            const fields = RULE_FIELD_MAP[rule.key];
            const enabled = draft[fields.enabledKey] as boolean;
            const template = draft.templates[rule.key] ?? {};
            const isExpanded = expandedTemplate === rule.key;

            return (
              <div key={rule.key} className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-800">{rule.label}</h3>
                    <p className="mt-0.5 text-xs text-slate-500">{rule.description}</p>
                  </div>
                  <label className="relative inline-flex shrink-0 cursor-pointer items-center">
                    <input type="checkbox" checked={enabled} onChange={(e) => updateField(fields.enabledKey, e.target.checked as any)} className="peer sr-only" />
                    <div className="h-6 w-11 rounded-full bg-slate-200 peer-checked:bg-[var(--color-brand)] peer-focus:outline-none after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-all peer-checked:after:translate-x-5" />
                  </label>
                </div>

                {enabled && (
                  <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">
                    {fields.timingKey && (
                      <div className="flex items-center gap-2 text-sm text-slate-600">
                        <span>{fields.timingLabel}</span>
                        <input
                          type="number"
                          min={0}
                          value={draft[fields.timingKey] as number}
                          onChange={(e) => updateField(fields.timingKey!, Number(e.target.value) as any)}
                          className="w-16 rounded-lg border border-slate-300 px-2 py-2 text-base lg:py-1 lg:text-sm"
                        />
                        <span>{fields.timingSuffix}</span>
                      </div>
                    )}

                    <button onClick={() => setExpandedTemplate(isExpanded ? null : rule.key)} className="text-xs font-medium text-[var(--color-brand)] underline">
                      {isExpanded ? 'Hide' : 'Customize'} message template
                    </button>

                    {isExpanded && (
                      <div className="space-y-2 rounded-lg bg-slate-50 p-3">
                        <div>
                          <label className="text-xs font-medium text-slate-500">Subject (email only)</label>
                          <input
                            value={template.subject ?? ''}
                            onChange={(e) => updateTemplate(rule.key, { subject: e.target.value })}
                            placeholder="Leave blank to use the default"
                            className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-3 text-base lg:py-1.5 lg:text-sm"
                          />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-slate-500">Message</label>
                          <textarea
                            value={template.body ?? ''}
                            onChange={(e) => updateTemplate(rule.key, { body: e.target.value })}
                            placeholder="Leave blank to use the default message"
                            rows={3}
                            className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-3 text-base lg:py-1.5 lg:text-sm"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </>
      )}
    </SettingsSectionShell>
  );
}
