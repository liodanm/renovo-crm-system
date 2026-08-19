'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Building2 } from 'lucide-react';
import { portalNavItems } from '../../lib/portal/portal-nav';
import { darkenHex } from '../../lib/theme/brand-theme-injector';
import { cn } from '../../lib/utils';

/**
 * Deliberately its own layout, not a reuse of the staff app's AppShell/
 * Sidebar — the portal is a genuinely separate authenticated surface
 * (magic-link auth, PortalCustomerGuard, its own token storage), and a
 * customer should never see staff-app chrome (permission-gated nav
 * items, staff branding, "Renovo CRM" product name). This is the one
 * shared shell for every portal page from here forward, matching this
 * feature's own explicit design reference — not a parallel shell built
 * out of habit.
 *
 * Brand-color injection lives here now, not duplicated per-page — same
 * technique the Quote/Invoice detail pages already used individually
 * (setting --color-brand/-dark/-secondary on the document root), just
 * centralized since every portal page renders through this shell.
 * Those two detail pages still also run their own copy (sourced from
 * their own estimate/invoice response's branding, which arrives before
 * this shell's dashboard-header fetch typically resolves) — both set
 * the same real color for the same company, so this is redundant-but-
 * harmless there, not a second conflicting source of truth.
 */
export function PortalShell({
  children,
  companyName,
  logoUrl,
  primaryColor,
  secondaryColor,
  onSignOut,
}: {
  children: React.ReactNode;
  companyName?: string;
  logoUrl?: string | null;
  primaryColor?: string | null;
  secondaryColor?: string | null;
  onSignOut: () => void;
}) {
  const pathname = usePathname();

  useEffect(() => {
    const root = document.documentElement;
    if (primaryColor) {
      root.style.setProperty('--color-brand', primaryColor);
      root.style.setProperty('--color-brand-dark', darkenHex(primaryColor));
    }
    if (secondaryColor) {
      root.style.setProperty('--color-brand-secondary', secondaryColor);
    }
    return () => {
      root.style.removeProperty('--color-brand');
      root.style.removeProperty('--color-brand-dark');
      root.style.removeProperty('--color-brand-secondary');
    };
  }, [primaryColor, secondaryColor]);

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="flex min-h-screen">
        {/* Sidebar — fixed width, matches the reference's proportions
            (roughly 250px) rather than the staff app's wider/collapsible
            sidebar; a customer portal doesn't need that flexibility. */}
        <aside className="hidden w-[250px] shrink-0 border-r border-slate-200 bg-white md:flex md:flex-col">
          <div className="flex items-center gap-2.5 border-b border-slate-100 px-5 py-5">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt={companyName ?? 'Company logo'} className="h-7 w-7 shrink-0 rounded object-contain" />
            ) : (
              <Building2 className="h-6 w-6 shrink-0 text-[var(--color-brand)]" aria-hidden="true" />
            )}
            <span className="truncate text-sm font-semibold text-slate-900">{companyName ?? 'Loading…'}</span>
          </div>

          <nav className="flex-1 space-y-0.5 px-3 py-4" aria-label="Portal navigation">
            {portalNavItems.map((item) => {
              const active = pathname?.startsWith(item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                    active ? 'bg-[var(--color-brand)]/[0.06] text-[var(--color-brand)]' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700',
                  )}
                >
                  <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="border-t border-slate-100 px-3 py-3">
            <button
              onClick={onSignOut}
              className="w-full rounded-lg px-3 py-2 text-left text-xs font-medium text-slate-400 transition-colors hover:bg-slate-50 hover:text-slate-600"
            >
              Sign out
            </button>
            <p className="mt-2 px-3 text-[11px] text-slate-300">Powered by Renovo CRM</p>
          </div>
        </aside>

        {/* Mobile top bar — the sidebar collapses entirely below md
            rather than becoming a squeezed rail, matching the reference's
            own apparent desktop-first design; a full mobile nav treatment
            (drawer, bottom tabs) is real follow-up work, not built here. */}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 md:hidden">
            <span className="text-sm font-semibold text-slate-900">{companyName ?? 'Loading…'}</span>
            <button onClick={onSignOut} className="text-xs font-medium text-slate-400">
              Sign out
            </button>
          </div>
          <nav className="flex gap-1 overflow-x-auto border-b border-slate-200 bg-white px-3 py-2 md:hidden" aria-label="Portal navigation">
            {portalNavItems.map((item) => {
              const active = pathname?.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium',
                    active ? 'bg-[var(--color-brand)]/[0.08] text-[var(--color-brand)]' : 'text-slate-500',
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          {/* Content width matches the reference's spacious, centered
              proportions — NOT the staff app's max-w-[1600px] full-bleed
              layout, and NOT the old portal's max-w-md mobile-card stack
              either. A portal page reads more like a document than a
              dense dashboard. */}
          <main className="flex-1 px-6 py-8 md:px-10 md:py-10">
            <div className="mx-auto max-w-[1100px]">{children}</div>
          </main>
        </div>
      </div>
    </div>
  );
}
