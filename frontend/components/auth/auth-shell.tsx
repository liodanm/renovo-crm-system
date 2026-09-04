'use client';

import { ReactNode, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

/**
 * Hero photo is a plain CSS background-image, not next/image. This app
 * had never used next/image before this page — its automatic
 * optimization pipeline needs the `sharp` package in production, which
 * isn't in this project's dependencies, and it silently failed to
 * serve the image at all on Railway (confirmed: the file itself is
 * present and valid in the repo, so this was specifically an
 * optimization/serving failure, not a missing asset). A plain
 * background-image bypasses that server-side processing entirely —
 * nothing to fail, at the cost of the automatic responsive/WebP
 * conversion next/image would have provided. Reasonable trade for one
 * already-small (~290KB) static hero image that never changes.
 *
 * Deliberately a FIXED dark theme, not tied to the app-wide Dark/Light/
 * Auto Environment setting (see settings/appearance) — flagged and
 * confirmed with the person before building this: a visitor hasn't
 * logged in yet, so there's no established "their preference" to
 * respect here, and treating the login screen as a fixed brand moment
 * (independent of whatever the OS happens to prefer) is the more
 * common, more intentional SaaS pattern. Every color below is an
 * explicit value, not a `dark:` variant — this page looks the same
 * regardless of the visitor's system theme.
 */
export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-[#0a1420] lg:flex-row">
      {/* Real bug, confirmed live on a phone: this container was
          missing flex-col for mobile — plain `flex` defaults to a ROW
          direction, so the mobile hero strip (w-full) and the form
          panel were being laid out SIDE BY SIDE instead of stacked,
          pushing the entire login form out of the visible layout.
          flex-col here, switching to flex-row only at the lg
          breakpoint where the two-panel desktop layout actually
          wants a row, is the fix. */}
      {/* Hero panel — real product photo (a Relentless Pressure Wash
          driveway job, before/after; this is the "during" half —
          hose visible, wet-clean vs dry-dirty contrast — cropped from
          a two-panel comparison shot). Hidden on mobile below a
          shorter top strip (see the lg:hidden block further down). */}
      <div
        role="img"
        aria-label="Pressure washing a residential driveway — before and after"
        className="relative hidden w-[55%] flex-col justify-between overflow-hidden bg-cover bg-center lg:flex"
        style={{ backgroundImage: "url('/hero-driveway.jpg')" }}
      >
        {/* Strongest overlay behind the text (bottom), fading toward
            transparent at the top so the photo itself stays the focal
            point, not a technique explained away by a task brief. */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#0a1420] via-[#0a1420]/55 to-[#0a1420]/10" />

        <div className="relative z-10 p-10 xl:p-12">
          <div className="text-lg font-semibold tracking-tight text-white">Renovo</div>
          <div className="mt-0.5 text-xs font-medium uppercase tracking-wider text-cyan-200/80">Pressure Washing CRM</div>
        </div>

        <div className="relative z-10 p-10 pb-14 xl:p-12 xl:pb-16">
          <div className="max-w-md">
            <p className="text-3xl font-semibold leading-tight tracking-tight text-white xl:text-4xl">
              Run your pressure washing business from one place.
            </p>
            <p className="mt-3 text-sm text-cyan-100/90">Quotes. Scheduling. Invoicing. Payments. Customers.</p>
            <p className="mt-1 text-sm text-cyan-100/70">Everything you need to manage the jobs that keep your business moving.</p>
          </div>

          {/* Purely presentational — no real data, no new backend or
              component dependency, matching the explicit "don't build
              fake product functionality" instruction. A static card,
              not a screenshot of anything real. */}
          <div className="mt-8 max-w-[240px] rounded-xl border border-white/10 bg-white/[0.07] p-4 backdrop-blur-sm">
            <p className="text-xs font-medium text-cyan-100/70">Today&apos;s Jobs</p>
            <p className="mt-1 text-2xl font-semibold text-white">8 scheduled</p>
            <div className="mt-2 flex items-center justify-between text-xs text-cyan-100/80">
              <span>$2,450 booked</span>
              <span>3 completed</span>
            </div>
          </div>

          <div className="mt-10 text-xs text-cyan-100/50">© {new Date().getFullYear()} Renovo CRM</div>
        </div>
      </div>

      {/* Short hero strip on mobile — image stays present (brand
          recognition, matches the desktop story) but never dominates
          a small screen; the form is always the priority there. */}
      <div
        role="img"
        aria-label=""
        className="relative h-[200px] w-full shrink-0 overflow-hidden bg-cover bg-center sm:h-[240px] lg:hidden"
        style={{ backgroundImage: "url('/hero-driveway.jpg')" }}
      >
        <div className="absolute inset-0 bg-gradient-to-t from-[#0a1420] via-[#0a1420]/40 to-[#0a1420]/10" />
        <div className="absolute left-5 top-5">
          <div className="text-base font-semibold tracking-tight text-white">Renovo</div>
          <div className="text-[11px] font-medium uppercase tracking-wider text-cyan-200/80">Pressure Washing CRM</div>
        </div>
      </div>

      {/* Form panel */}
      <div className="flex w-full flex-1 flex-col justify-center bg-[#0a1420] px-6 py-10 lg:w-[45%] lg:px-16">
        <div className="mx-auto w-full max-w-[420px]">
          <h1 className="text-2xl font-semibold tracking-tight text-white">{title}</h1>
          {subtitle && <p className="mt-2 text-sm text-slate-400">{subtitle}</p>}
          <div className="mt-8">{children}</div>
          {footer && <div className="mt-6 text-sm text-slate-400">{footer}</div>}
        </div>
      </div>
    </div>
  );
}

export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div role="alert" className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
      {message}
    </div>
  );
}

export function FormSuccess({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div role="status" className="mb-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
      {message}
    </div>
  );
}

export function TextField({
  label,
  type,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  const [visible, setVisible] = useState(false);
  const isPassword = type === 'password';

  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-slate-300">{label}</span>
      <div className="relative">
        <input
          {...props}
          type={isPassword ? (visible ? 'text' : 'password') : type}
          className="w-full rounded-lg border border-slate-700 bg-slate-900/60 px-3.5 py-3 text-[15px] text-white placeholder:text-slate-500 focus:border-[var(--color-brand)] focus:outline-none focus:ring-2 focus:ring-[var(--color-brand)]/30 lg:py-2.5 lg:text-sm"
          style={{ paddingRight: isPassword ? '2.75rem' : undefined }}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            aria-label={visible ? 'Hide password' : 'Show password'}
            className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-slate-400 hover:text-slate-200 focus:outline-none focus-visible:text-slate-200"
          >
            {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        )}
      </div>
    </label>
  );
}

export function PrimaryButton({
  children,
  isLoading,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { isLoading?: boolean }) {
  return (
    <button
      {...props}
      disabled={props.disabled || isLoading}
      className="flex h-[50px] w-full items-center justify-center rounded-[10px] bg-[var(--color-brand)] px-4 text-sm font-semibold text-white transition hover:bg-[var(--color-brand-dark)] active:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {isLoading ? 'Please wait…' : children}
    </button>
  );
}
