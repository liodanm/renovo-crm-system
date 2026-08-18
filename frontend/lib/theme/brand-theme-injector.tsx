'use client';

import { useEffect } from 'react';
import useSWR from 'swr';
import { useAuth } from '../auth/auth-context';
import { settingsApi } from '../api/settings';

/**
 * Darkens a hex color by a fixed percentage — used to derive
 * --color-brand-dark (hover states) from the company's own primaryColor
 * rather than storing a third color in companies.settings.branding.
 * Deliberately simple (uniform RGB channel scaling), not a full
 * HSL-based darken — this only needs to produce a plausible, readable
 * hover shade, not a perceptually-perfect one.
 */
export function darkenHex(hex: string, amount = 0.2): string {
  const match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!match) return hex;
  const [, r, g, b] = match;
  const scale = (channel: string) => Math.max(0, Math.round(parseInt(channel, 16) * (1 - amount)));
  const toHex = (n: number) => n.toString(16).padStart(2, '0');
  return `#${toHex(scale(r))}${toHex(scale(g))}${toHex(scale(b))}`;
}

/**
 * Per-company brand-color theming for the staff CRM app. Overrides only
 * --color-brand / --color-brand-secondary / --color-brand-dark on
 * <html> — the exact same variables globals.css already defines
 * globally, but now sourced from the authenticated user's own company
 * (companies.settings.branding), not a single hardcoded value shared by
 * every tenant. --color-brand-gray / --color-brand-gray-light are
 * deliberately left untouched: those are generic, neutral UI tones
 * (icons, muted text), not colors extracted from any particular
 * company's logo, so there's no reason for them to vary per tenant.
 *
 * Renders nothing — this is a side-effect-only component. Naturally
 * inert on portal routes and before login, since useAuth()'s `user` is
 * null in both cases; the browser simply keeps using globals.css's
 * static fallback values until a real company's colors are known.
 */
export function BrandThemeInjector() {
  const { user } = useAuth();
  const { data: branding } = useSWR(user ? 'app-shell-branding' : null, () => settingsApi.getBranding());

  useEffect(() => {
    const root = document.documentElement;
    if (branding?.primaryColor) {
      root.style.setProperty('--color-brand', branding.primaryColor);
      root.style.setProperty('--color-brand-dark', darkenHex(branding.primaryColor));
    } else {
      root.style.removeProperty('--color-brand');
      root.style.removeProperty('--color-brand-dark');
    }
    if (branding?.secondaryColor) {
      root.style.setProperty('--color-brand-secondary', branding.secondaryColor);
    } else {
      root.style.removeProperty('--color-brand-secondary');
    }
  }, [branding?.primaryColor, branding?.secondaryColor]);

  // Also reset on logout — otherwise the previous user's company colors
  // would visibly persist for a moment on the login screen.
  useEffect(() => {
    if (!user) {
      const root = document.documentElement;
      root.style.removeProperty('--color-brand');
      root.style.removeProperty('--color-brand-dark');
      root.style.removeProperty('--color-brand-secondary');
    }
  }, [user]);

  return null;
}
