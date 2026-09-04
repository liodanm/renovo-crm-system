'use client';

import { createContext, useContext, useEffect, useState } from 'react';

const STORAGE_KEY = 'renovo_theme';

// The customer-facing SELECTION — 'auto' means "follow the OS/browser
// preference," not a fixed value. This is distinct from the RESOLVED
// theme actually applied to <html> (always concretely 'light' or
// 'dark'), computed below.
type ThemeSelection = 'light' | 'dark' | 'auto';
type ResolvedTheme = 'light' | 'dark';

interface ThemeContextValue {
  /** The user's actual selection, including 'auto' — what the Appearance settings UI should show as checked. */
  theme: ThemeSelection;
  /** What's actually applied right now — always concrete, never 'auto'. Useful for anything that needs to know the real current appearance. */
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: ThemeSelection) => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

function prefersDark(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function resolve(selection: ThemeSelection): ResolvedTheme {
  return selection === 'auto' ? (prefersDark() ? 'dark' : 'light') : selection;
}

function applyToDocument(resolved: ResolvedTheme) {
  document.documentElement.classList.toggle('dark', resolved === 'dark');
}

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
 *
 * 'auto' added on top of the existing light/dark architecture — same
 * storage key, same anti-flash inline-script mechanism in layout.tsx
 * (updated alongside this to resolve 'auto' before first paint too),
 * no new provider, no competing theme system.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Starts as 'light' to match the server-rendered markup exactly (no
  // access to localStorage/matchMedia during SSR) — the inline script
  // in layout.tsx already applied the real resolved class to <html>
  // before this component ever mounts, so there's no visible flash;
  // this state just needs to catch up to match on the client for
  // anything that reads `theme`/`resolvedTheme` directly (the
  // Appearance settings UI itself).
  const [theme, setThemeState] = useState<ThemeSelection>('light');
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>('light');

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    const initial: ThemeSelection = stored === 'dark' || stored === 'light' || stored === 'auto' ? stored : 'light';
    setThemeState(initial);
    setResolvedTheme(resolve(initial));
  }, []);

  useEffect(() => {
    // Only matters while 'auto' is selected — if the user picked an
    // explicit Dark/Light, changing the OS preference in the
    // background must NOT silently flip Renovo's theme out from
    // under them. This is exactly why "Auto Environment" and a
    // manually-scheduled day/night mode are different things — auto
    // tracks the OS live, an explicit choice stays put regardless of
    // what the OS does.
    if (theme !== 'auto') return;
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      const next = mql.matches ? 'dark' : 'light';
      setResolvedTheme(next);
      applyToDocument(next);
    };
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [theme]);

  function setTheme(next: ThemeSelection) {
    setThemeState(next);
    window.localStorage.setItem(STORAGE_KEY, next);
    const resolved = resolve(next);
    setResolvedTheme(resolved);
    applyToDocument(resolved);
  }

  return <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
