'use client';

import { useEffect, useMemo, useState } from 'react';
import { Check, ChevronLeft, Loader2 } from 'lucide-react';
import { SERVICE_TYPE_ICONS } from '../../../lib/api/service-catalog';
import {
  quoteWidgetApi,
  QuoteWidgetApiError,
  type PublicQuoteBranding,
  type PublicQuoteService,
} from '../../../lib/api/quote-widget';

const UNIT_LABELS: Record<string, string> = { sq_ft: 'sq ft', linear_ft: 'linear ft', each: 'each', hours: 'hours', flat_rate: 'flat rate' };
const UNIT_QUESTIONS: Record<string, string> = {
  sq_ft: 'Approximate square footage',
  linear_ft: 'Approximate linear footage',
  each: 'How many?',
  hours: 'Estimated hours',
};

type Step = 'service' | 'property' | 'contact' | 'review' | 'success';
const STEP_ORDER: Exclude<Step, 'success'>[] = ['service', 'property', 'contact', 'review'];

function currency(value: string | number): string {
  return `$${Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function QuoteWidgetClient({ companySlug }: { companySlug: string }) {
  const [branding, setBranding] = useState<PublicQuoteBranding | null>(null);
  const [services, setServices] = useState<PublicQuoteService[] | null>(null);
  const [loadError, setLoadError] = useState<'not_found' | 'generic' | null>(null);

  const [step, setStep] = useState<Step>('service');
  const [selectedServiceIds, setSelectedServiceIds] = useState<Set<string>>(new Set());
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [address, setAddress] = useState({ addressLine1: '', city: '', state: '', postalCode: '' });
  const [contact, setContact] = useState({ firstName: '', lastName: '', email: '', phone: '' });
  // Real bots that fill every visible field will fill this too — a
  // sighted human never sees it. Sent as companyWebsite, matching the
  // exact existing backend honeypot field name — not a new mechanism.
  const [honeypot, setHoneypot] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<{ estimateNumber: string; totalAmount: string } | null>(null);

  // Generated once per page load, reused on every retry of the same
  // attempt (including the browser's own network-retry behavior) —
  // matches the backend's own documented idempotency-key contract
  // exactly: same key across retries of one logical submission, not a
  // fresh key on every render.
  const [idempotencyKey] = useState(() => crypto.randomUUID());

  useEffect(() => {
    Promise.all([quoteWidgetApi.getBranding(companySlug), quoteWidgetApi.getServices(companySlug)])
      .then(([b, s]) => {
        setBranding(b);
        setServices(s);
      })
      .catch((err) => {
        setLoadError(err instanceof QuoteWidgetApiError && err.status === 404 ? 'not_found' : 'generic');
      });
  }, [companySlug]);

  const selectedServices = useMemo(() => (services ?? []).filter((s) => selectedServiceIds.has(s.id)), [services, selectedServiceIds]);
  const brandColor = branding?.primaryColor || '#0f766e';

  function toggleService(id: string) {
    setSelectedServiceIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function goNext() {
    const i = STEP_ORDER.indexOf(step as Exclude<Step, 'success'>);
    if (i < STEP_ORDER.length - 1) setStep(STEP_ORDER[i + 1]);
  }
  function goBack() {
    const i = STEP_ORDER.indexOf(step as Exclude<Step, 'success'>);
    if (i > 0) setStep(STEP_ORDER[i - 1]);
  }

  const canContinueService = selectedServiceIds.size > 0 && selectedServices.every((s) => s.defaultUnitOfMeasure === 'flat_rate' || Number(quantities[s.id]) > 0);
  const canContinueProperty = !!(address.addressLine1.trim() && address.city.trim() && address.state.trim() && address.postalCode.trim());
  const canContinueContact = !!(contact.firstName.trim() && /\S+@\S+\.\S+/.test(contact.email) && contact.phone.trim().length >= 7);

  async function handleSubmit() {
    if (isSubmitting || result) return; // prevents any possibility of a double-click firing two requests
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const response = await quoteWidgetApi.submitQuote(companySlug, {
        firstName: contact.firstName.trim(),
        lastName: contact.lastName.trim() || undefined,
        email: contact.email.trim(),
        phone: contact.phone.trim(),
        addressLine1: address.addressLine1.trim(),
        city: address.city.trim(),
        state: address.state.trim(),
        postalCode: address.postalCode.trim(),
        services: selectedServices.map((s) => ({
          serviceCatalogItemId: s.id,
          quantity: s.defaultUnitOfMeasure === 'flat_rate' ? 1 : Number(quantities[s.id]),
        })),
        idempotencyKey,
        companyWebsite: honeypot || undefined,
      });
      if ('estimateNumber' in response) {
        setResult(response);
      }
      setStep('success');
    } catch (err) {
      if (err instanceof QuoteWidgetApiError && err.status === 429) {
        setSubmitError("You've reached the maximum number of requests for now. Please try again later.");
      } else {
        setSubmitError("We couldn't create your estimate right now. Please try again.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  if (loadError === 'not_found') {
    return <CenteredMessage title="This quote page is unavailable." />;
  }
  if (loadError === 'generic') {
    return <CenteredMessage title="Sorry, we're having trouble loading our services." subtitle="Please try again in a moment." />;
  }
  if (!branding || !services) {
    return <CenteredMessage title="Loading…" loading />;
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white px-4 py-4">
        <div className="mx-auto flex max-w-lg items-center gap-3">
          {branding.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- external, per-tenant logo URL; next/image's domain allowlist doesn't make sense for arbitrary tenant-uploaded logos
            <img src={branding.logoUrl} alt={branding.companyName} className="h-9 w-auto" />
          ) : (
            <span className="text-lg font-semibold text-slate-900">{branding.companyName}</span>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-lg px-4 py-6">
        {step !== 'success' && (
          <>
            <div className="mb-5 flex items-center gap-1.5">
              {STEP_ORDER.map((s) => (
                <div key={s} className="h-1.5 flex-1 rounded-full" style={{ backgroundColor: STEP_ORDER.indexOf(step as Exclude<Step, 'success'>) >= STEP_ORDER.indexOf(s) ? brandColor : '#e2e8f0' }} />
              ))}
            </div>
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">
              Step {STEP_ORDER.indexOf(step as Exclude<Step, 'success'>) + 1} of {STEP_ORDER.length}
            </p>
          </>
        )}

        {step === 'service' && (
          <div>
            <h1 className="text-xl font-semibold text-slate-900">Get Your Estimate</h1>
            <p className="mt-1 text-sm text-slate-500">Choose the services you&apos;re interested in.</p>
            <div className="mt-5 space-y-2">
              {services.length === 0 && <p className="text-sm text-slate-500">No services are currently available for online quotes. Please contact us directly.</p>}
              {services.map((s) => {
                const Icon = SERVICE_TYPE_ICONS[s.serviceType] ?? SERVICE_TYPE_ICONS.other;
                const selected = selectedServiceIds.has(s.id);
                return (
                  <div key={s.id}>
                    <button
                      onClick={() => toggleService(s.id)}
                      className="flex w-full items-center gap-3 rounded-xl border-2 bg-white p-4 text-left transition"
                      style={{ borderColor: selected ? brandColor : '#e2e8f0' }}
                    >
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg" style={{ backgroundColor: selected ? `${brandColor}1a` : '#f1f5f9' }}>
                        <Icon className="h-5 w-5" style={{ color: selected ? brandColor : '#64748b' }} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium text-slate-900">{s.name}</span>
                        {s.description && <span className="block truncate text-xs text-slate-400">{s.description}</span>}
                      </span>
                      <span
                        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2"
                        style={{ borderColor: selected ? brandColor : '#cbd5e1', backgroundColor: selected ? brandColor : 'transparent' }}
                      >
                        {selected && <Check className="h-4 w-4 text-white" />}
                      </span>
                    </button>
                    {selected && s.defaultUnitOfMeasure !== 'flat_rate' && (
                      <div className="mt-2 pl-4">
                        <label className="block text-xs font-medium text-slate-600">{UNIT_QUESTIONS[s.defaultUnitOfMeasure] ?? 'Quantity'}</label>
                        <input
                          type="number"
                          inputMode="decimal"
                          min={0}
                          value={quantities[s.id] ?? ''}
                          onChange={(e) => setQuantities((prev) => ({ ...prev, [s.id]: e.target.value }))}
                          placeholder={UNIT_LABELS[s.defaultUnitOfMeasure]}
                          className="mt-1 w-32 rounded-lg border border-slate-300 px-3 py-2.5 text-base focus:border-transparent focus:outline-none focus:ring-2"
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <PrimaryButton disabled={!canContinueService} onClick={goNext} color={brandColor}>
              Continue
            </PrimaryButton>
          </div>
        )}

        {step === 'property' && (
          <div>
            <h1 className="text-xl font-semibold text-slate-900">Where is the property?</h1>
            <p className="mt-1 text-sm text-slate-500">Your property address helps us calculate your estimate accurately.</p>
            <div className="mt-5 space-y-3">
              <Field label="Street Address">
                <input value={address.addressLine1} onChange={(e) => setAddress({ ...address, addressLine1: e.target.value })} className={inputClass} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="City">
                  <input value={address.city} onChange={(e) => setAddress({ ...address, city: e.target.value })} className={inputClass} />
                </Field>
                <Field label="State">
                  <input value={address.state} onChange={(e) => setAddress({ ...address, state: e.target.value })} maxLength={2} className={inputClass} />
                </Field>
              </div>
              <Field label="ZIP Code">
                <input value={address.postalCode} onChange={(e) => setAddress({ ...address, postalCode: e.target.value })} inputMode="numeric" className={inputClass} />
              </Field>
            </div>
            <BackAndContinue onBack={goBack} onNext={goNext} disabled={!canContinueProperty} color={brandColor} />
          </div>
        )}

        {step === 'contact' && (
          <div>
            <h1 className="text-xl font-semibold text-slate-900">Where should we send your estimate?</h1>
            <p className="mt-1 text-sm text-slate-500">We&apos;ll only use this to prepare and deliver your estimate.</p>
            <div className="mt-5 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Field label="First Name">
                  <input value={contact.firstName} onChange={(e) => setContact({ ...contact, firstName: e.target.value })} className={inputClass} />
                </Field>
                <Field label="Last Name">
                  <input value={contact.lastName} onChange={(e) => setContact({ ...contact, lastName: e.target.value })} className={inputClass} />
                </Field>
              </div>
              <Field label="Email">
                <input type="email" value={contact.email} onChange={(e) => setContact({ ...contact, email: e.target.value })} className={inputClass} />
              </Field>
              <Field label="Phone">
                <input type="tel" value={contact.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value })} className={inputClass} />
              </Field>
              <input
                type="text"
                value={honeypot}
                onChange={(e) => setHoneypot(e.target.value)}
                tabIndex={-1}
                autoComplete="off"
                aria-hidden="true"
                className="absolute -left-[9999px] h-0 w-0 opacity-0"
              />
            </div>
            <BackAndContinue onBack={goBack} onNext={goNext} disabled={!canContinueContact} color={brandColor} />
          </div>
        )}

        {step === 'review' && (
          <div>
            <h1 className="text-xl font-semibold text-slate-900">Your Estimate Request</h1>
            <div className="mt-5 space-y-4 rounded-xl border border-slate-200 bg-white p-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Services</p>
                <ul className="mt-1 space-y-0.5 text-sm text-slate-700">
                  {selectedServices.map((s) => (
                    <li key={s.id}>{s.name}</li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Property</p>
                <p className="mt-1 text-sm text-slate-700">{address.addressLine1}</p>
                <p className="text-sm text-slate-700">{address.city}, {address.state} {address.postalCode}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Contact</p>
                <p className="mt-1 text-sm text-slate-700">{contact.firstName} {contact.lastName}</p>
                <p className="text-sm text-slate-700">{contact.email}</p>
                <p className="text-sm text-slate-700">{contact.phone}</p>
              </div>
            </div>
            <p className="mt-3 text-xs text-slate-400">Your estimate will be created instantly and emailed to you.</p>
            {submitError && <p className="mt-3 text-sm text-red-600">{submitError}</p>}
            <div className="mt-5 flex items-center gap-3">
              <button onClick={goBack} disabled={isSubmitting} className="flex items-center gap-1 rounded-lg px-3 py-3 text-sm font-medium text-slate-600 disabled:opacity-50">
                <ChevronLeft className="h-4 w-4" /> Back
              </button>
              <button
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-3.5 text-base font-semibold text-white disabled:opacity-70"
                style={{ backgroundColor: brandColor }}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Creating Your Estimate…
                  </>
                ) : (
                  'Get My Estimate'
                )}
              </button>
            </div>
          </div>
        )}

        {step === 'success' && (
          <div className="rounded-xl border border-slate-200 bg-white p-6 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full" style={{ backgroundColor: `${brandColor}1a` }}>
              <Check className="h-6 w-6" style={{ color: brandColor }} />
            </div>
            <h1 className="mt-4 text-xl font-semibold text-slate-900">Your Estimate Is Ready</h1>
            <p className="mt-2 text-sm text-slate-600">Thank you, {contact.firstName}!</p>
            <p className="mt-1 text-sm text-slate-600">Your estimate has been created and sent to {contact.email}.</p>
            {result && (
              <div className="mx-auto mt-4 max-w-xs rounded-lg bg-slate-50 p-4">
                <p className="text-xs text-slate-400">Estimate {result.estimateNumber}</p>
                <p className="mt-0.5 text-2xl font-semibold text-slate-900">{currency(result.totalAmount)}</p>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

const inputClass = 'mt-1 w-full rounded-lg border border-slate-300 px-3 py-3 text-base focus:border-transparent focus:outline-none focus:ring-2';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-600">{label}</label>
      {children}
    </div>
  );
}

function PrimaryButton({ children, onClick, disabled, color }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; color: string }) {
  return (
    <button onClick={onClick} disabled={disabled} className="mt-6 w-full rounded-lg px-4 py-3.5 text-base font-semibold text-white disabled:opacity-40" style={{ backgroundColor: color }}>
      {children}
    </button>
  );
}

function BackAndContinue({ onBack, onNext, disabled, color }: { onBack: () => void; onNext: () => void; disabled?: boolean; color: string }) {
  return (
    <div className="mt-6 flex items-center gap-3">
      <button onClick={onBack} className="flex items-center gap-1 rounded-lg px-3 py-3.5 text-sm font-medium text-slate-600">
        <ChevronLeft className="h-4 w-4" /> Back
      </button>
      <button onClick={onNext} disabled={disabled} className="flex-1 rounded-lg px-4 py-3.5 text-base font-semibold text-white disabled:opacity-40" style={{ backgroundColor: color }}>
        Continue
      </button>
    </div>
  );
}

function CenteredMessage({ title, subtitle, loading }: { title: string; subtitle?: string; loading?: boolean }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="text-center">
        {loading && <Loader2 className="mx-auto mb-3 h-6 w-6 animate-spin text-slate-400" />}
        <p className="text-base font-medium text-slate-700">{title}</p>
        {subtitle && <p className="mt-1 text-sm text-slate-400">{subtitle}</p>}
      </div>
    </div>
  );
}
