'use client';

import { useState } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { DASHBOARD_WIDGETS, WIDGET_CATEGORIES } from '../../lib/dashboard-widgets-registry';
import { useDashboardWidgetPrefs } from '../../lib/hooks/use-dashboard-widget-prefs';
import { DashboardReportWidget } from './DashboardReportWidget';
import { CustomizeDashboardModal } from './CustomizeDashboardModal';

export function DashboardReportWidgets() {
  const { enabledIds, toggleWidget, isEnabled } = useDashboardWidgetPrefs();
  const [modalOpen, setModalOpen] = useState(false);

  // Rendered even before localStorage has loaded — DEFAULT_WIDGET_IDS is
  // the initial state, so there's no flash of an empty Dashboard while
  // the real preference loads; if it differs from the default, this
  // section quietly reflows once `loaded` flips true, no separate
  // loading state needed for the section itself.
  const enabledWidgets = DASHBOARD_WIDGETS.filter((w) => enabledIds.includes(w.id));

  return (
    <div>
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Your Reports</h2>
        <button
          onClick={() => setModalOpen(true)}
          className="flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
        >
          <SlidersHorizontal className="h-3.5 w-3.5" /> Customize Dashboard
        </button>
      </div>

      {enabledWidgets.length === 0 && (
        <div className="mt-3 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 p-6 text-center text-sm text-slate-400 dark:text-slate-500">
          No reports on your Dashboard yet. Click &ldquo;Customize Dashboard&rdquo; to add some.
        </div>
      )}

      {WIDGET_CATEGORIES.map((category) => {
        const widgetsInCategory = enabledWidgets.filter((w) => w.category === category);
        if (widgetsInCategory.length === 0) return null; // hide empty categories, per this feature's explicit requirement
        return (
          <div key={category} className="mt-3">
            <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">{category}</p>
            <div className="mt-1.5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {widgetsInCategory.map((widget) => (
                <DashboardReportWidget key={widget.id} widget={widget} />
              ))}
            </div>
          </div>
        );
      })}

      {modalOpen && <CustomizeDashboardModal isEnabled={isEnabled} onToggle={toggleWidget} onClose={() => setModalOpen(false)} />}
    </div>
  );
}
