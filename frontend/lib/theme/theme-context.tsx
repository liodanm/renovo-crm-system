'use client';

import { createContext, useContext, useEffect, useState } from 'react';

const STORAGE_KEY = 'renovo_theme';

type Theme = 'light' | 'dark';

interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

/**
 * Deliberately localStorage-only, no backend/DB persistence. This is a
 * personal display preference, not a company setting — there's no
 * existing per-user preferences field anywhere in the schema to hang
 * it on (users table is all discrete typed columns, no JSONB blob;
 * companies.settings is company-wide and would be the wrong owner for
 * an individual staff member's display preference). localStorage is
 * tied to the browser origin, not the auth session, so it already
 * survives both a page refresh and a logout/login cycle on the same
 * browser — the two things this feature is actually required to
 * survive. The one disclosed trade-off: it does not sync across
 * different devices/browsers for the same user. If that's ever
 * wanted, it's a real, separate decision (additive nullable column on
 * `users`, a migration) — not something to add silently later.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Starts as 'light' to match the server-rendered markup exactly (no
  // access to localStorage during SSR) — the inline script in
  // layout.tsx already applied the real class to <html> before this
  // component ever mounts, so there's no visible flash; this state
  // just needs to catch up to match on the client for anything that
  // reads `theme` directly (the Appearance toggle itself).
  const [theme, setThemeState] = useState<Theme>('light');

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === 'dark' || stored === 'light') {
      setThemeState(stored);
    }
  }, []);

  function setTheme(next: Theme) {
    setThemeState(next);
    window.localStorage.setItem(STORAGE_KEY, next);
    document.documentElement.classList.toggle('dark', next === 'dark');
  }

  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
