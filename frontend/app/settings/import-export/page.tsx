'use client';

import { useState } from 'react';
import { customersApi } from '../../../lib/api/customers';
import { ImportCsvModal } from '../../../components/customers/import-csv-modal';
import { PermissionGate } from '../../../components/auth/permission-gate';
import { SettingsSectionShell } from '../../../components/settings/SettingsSectionShell';

/**
 * Relocated from the Customers list page — the functionality itself is
 * completely unchanged (same ImportCsvModal component, same
 * customersApi.exportCsv()/importCsv() calls, same
 * customers.write PermissionGate on Import). Only where it's triggered
 * from moved.
 *
 * No hasUnsavedChanges/onSave here — there's nothing to save on this
 * page (both actions are immediate, not draft-and-submit), so the
 * SettingsSectionShell save bar is never shown, matching how Appearance
 * (the other no-save-step settings page) already handles this.
 */
export default function ImportExportSettingsPage() {
  const [showImport, setShowImport] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  async function handleExport() {
    setIsExporting(true);
    try {
      await customersApi.exportCsv();
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <SettingsSectionShell
      backHref="/settings"
      title="Import / Export"
      description="Import customers from a CSV file, or export your current customer list."
      hasUnsavedChanges={false}
      isSaving={false}
      error={null}
      onSave={() => {}}
      onCancel={() => {}}
    >
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Export Customers</h2>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Download every customer in your account as a CSV file.</p>
        <button
          onClick={handleExport}
          disabled={isExporting}
          className="mt-3 rounded-lg border border-slate-300 dark:border-slate-700 px-4 py-3 text-base font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-800 disabled:opacity-50 lg:py-2 lg:text-sm"
        >
          {isExporting ? 'Exporting…' : 'Export CSV'}
        </button>
      </div>

      <PermissionGate permissions={['customers.write']}>
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Import Customers</h2>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Upload a CSV file to add or update customers in bulk.</p>
          <button
            onClick={() => setShowImport(true)}
            className="mt-3 rounded-lg border border-slate-300 dark:border-slate-700 px-4 py-3 text-base font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-800 lg:py-2 lg:text-sm"
          >
            Import CSV
          </button>
        </div>
      </PermissionGate>

      {showImport && (
        <ImportCsvModal
          onClose={() => setShowImport(false)}
          onImported={() => {
            // On the original Customers page this refreshed the customer
            // list (mutate()). There's no list to refresh here — the
            // modal manages its own report view internally and only
            // closes via its own "Done" button (onClose), so this must
            // stay a no-op rather than closing the modal, or the report
            // screen would never be visible.
          }}
        />
      )}
    </SettingsSectionShell>
  );
}
