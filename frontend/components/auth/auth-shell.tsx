import { ReactNode } from 'react';

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
    <div className="flex min-h-screen">
      {/* Brand panel — left on desktop, hidden on mobile to keep the form the focus */}
      <div className="relative hidden w-1/2 flex-col justify-between overflow-hidden bg-[var(--color-brand-dark)] p-12 text-white lg:flex">
        <div
          className="pointer-events-none absolute inset-0 opacity-20"
          style={{
            backgroundImage:
              'repeating-linear-gradient(115deg, transparent, transparent 40px, rgba(255,255,255,0.08) 40px, rgba(255,255,255,0.08) 41px)',
          }}
        />
        <div className="relative text-xl font-semibold tracking-tight">Renovo CRM</div>
        <div className="relative max-w-sm">
          <p className="text-2xl font-medium leading-snug">
            Run your whole pressure washing operation from one place.
          </p>
          <p className="mt-4 text-sm text-cyan-100">
            Scheduling, quotes, invoicing, and your crew — all in sync.
          </p>
        </div>
        <div className="relative text-xs text-cyan-100/70">© {new Date().getFullYear()} Renovo CRM</div>
      </div>

      {/* Form panel */}
      <div className="flex w-full flex-col justify-center px-6 py-12 lg:w-1/2 lg:px-20">
        <div className="mx-auto w-full max-w-sm">
          <div className="mb-2 text-sm font-semibold tracking-tight text-[var(--color-brand)] lg:hidden">
            Renovo CRM
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
          {subtitle && <p className="mt-2 text-sm text-slate-500">{subtitle}</p>}
          <div className="mt-8">{children}</div>
          {footer && <div className="mt-6 text-sm text-slate-500">{footer}</div>}
        </div>
      </div>
    </div>
  );
}

export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
      {message}
    </div>
  );
}

export function FormSuccess({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div role="status" className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
      {message}
    </div>
  );
}

export function TextField({
  label,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-slate-700">{label}</span>
      <input
        {...props}
        className="w-full rounded-lg border border-slate-300 px-3 py-3 text-base text-slate-900 placeholder:text-slate-400 focus:border-[var(--color-brand)] focus:outline-none focus:ring-2 focus:ring-[var(--color-brand)]/20 lg:py-2 lg:text-sm"
      />
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
      className="flex w-full items-center justify-center rounded-lg bg-[var(--color-brand)] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[var(--color-brand-dark)] disabled:cursor-not-allowed disabled:opacity-60"
    >
      {isLoading ? 'Please wait…' : children}
    </button>
  );
}
