'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../auth/auth-context';
import { DEFAULT_WIDGET_IDS } from '../dashboard-widgets-registry';

/**
 * No existing user-level preferences mechanism exists in Renovo today —
 * checked the schema directly: `users` has no JSONB/preferences column,
 * only `companies.settings` (JSONB, company-wide) does. Per this
 * feature's own explicit instruction to stop and explain rather than
 * silently add a migration for something this small, localStorage is
 * used instead: genuinely user-specific (keyed per userId, so a shared
 * office computer doesn't mix up two people's choices), persists across
 * refresh and logout/login on the same browser, and needs zero backend
 * changes or schema risk. The real, honest tradeoff: this does NOT sync
 * across devices/browsers — a user who customizes their Dashboard on a
 * desktop won't see the same layout on their phone. That's a deliberate
 * choice, not an oversight; see this feature's final report for the
 * full reasoning and the migration path if cross-device sync is ever
 * wanted later.
 */
function storageKey(userId: string): string {
  return `renovo-dashboard-widgets-${userId}`;
}

export function useDashboardWidgetPrefs() {
  const { user } = useAuth();
  const [enabledIds, setEnabledIds] = useState<string[]>(DEFAULT_WIDGET_IDS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!user?.userId) return;
    try {
      const raw = localStorage.getItem(storageKey(user.userId));
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) setEnabledIds(parsed);
      }
    } catch {
      // Corrupt/unreadable localStorage value — fall back to defaults
      // rather than breaking the Dashboard over a preferences read.
    }
    setLoaded(true);
  }, [user?.userId]);

  const toggleWidget = useCallback(
    (widgetId: string) => {
      if (!user?.userId) return;
      setEnabledIds((prev) => {
        const next = prev.includes(widgetId) ? prev.filter((id) => id !== widgetId) : [...prev, widgetId];
        try {
          localStorage.setItem(storageKey(user.userId), JSON.stringify(next));
        } catch {
          // Persistence failing shouldn't crash the toggle itself — the
          // in-memory state still updates for this session.
        }
        return next;
      });
    },
    [user?.userId],
  );

  const isEnabled = useCallback((widgetId: string) => enabledIds.includes(widgetId), [enabledIds]);

  return { enabledIds, toggleWidget, isEnabled, loaded };
}
