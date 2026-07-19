'use client';

import useSWR from 'swr';
import { settingsApi } from '../../../lib/api/settings';
import { SettingsSectionShell } from '../../../components/settings/SettingsSectionShell';
import { IntegrationStatusCard } from '../../../components/settings/IntegrationStatusCard';

export default function StorageSettingsPage() {
  const { data } = useSWR('settings-storage', () => settingsApi.getStorageSettings());

  return (
    <SettingsSectionShell title="Storage" description="File storage connection status and upload limits." hasUnsavedChanges={false} isSaving={false} error={null} onSave={() => {}} onCancel={() => {}}>
      {!data ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : (
        <>
          <IntegrationStatusCard status={data.s3} />

          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-slate-700">Upload Limits</h2>
            <p className="mt-2 text-sm text-slate-700">Maximum photo size: <strong>{data.maxUploadSizeMb} MB</strong></p>
            <p className="mt-1 text-xs text-slate-400">This is the real limit enforced on every upload — not a separate, editable number that could drift from what's actually checked.</p>
          </div>
        </>
      )}
    </SettingsSectionShell>
  );
}
