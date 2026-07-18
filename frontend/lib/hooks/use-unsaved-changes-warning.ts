'use client';

import { useEffect } from 'react';

/**
 * beforeunload is the real, working level of protection available here
 * — Next.js App Router has no public router-navigation-intercept API,
 * so an in-app "are you sure you want to leave this page" guard on
 * clicking another nav link isn't something this can honestly promise
 * yet. What this does guarantee: closing the tab, refreshing, or typing
 * a new URL while a form has unsaved changes triggers the browser's own
 * native confirmation.
 */
export function useUnsavedChangesWarning(hasUnsavedChanges: boolean) {
  useEffect(() => {
    if (!hasUnsavedChanges) return;
    function handler(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = '';
    }
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [hasUnsavedChanges]);
}
