'use client';

import useSWR from 'swr';
import Link from 'next/link';
import { Receipt } from 'lucide-react';
import { portalApiFetch } from '../../../lib/portal/portal-api-client';
import { clearPortalToken, getPortalCompanySlug } from '../../../lib/portal/portal-token-storage';
import { PortalShell } from '../../../components/portal/PortalShell';
import { StatusBadge, INVOICE_STATUS_COLORS } from '../../../components/action-center/StatusBadge';

interface DashboardResponse {
  customer: { name: string };
  company: { name: string; logoUrl: string | null; primaryColor: string | null; secondaryColor: string | null };
}

interface InvoiceListItem {
  id: string;
  invoiceNumber: string;
  status: string;
  totalAmount: string;
  balanceDue: string;
  dueDate: string | null;
  createdAt: string;
}

const money = (v: string | number) => `$${Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function PortalInvoicesPage() {
  const { data: dashboard } = useSWR<DashboardResponse>('portal-dashboard-header', () => portalApiFetch<DashboardResponse>('/portal/dashboard'));
  const { data: invoices, error, isLoading } = useSWR<InvoiceListItem[]>('portal-invoices', () => portalApiFetch<InvoiceListItem[]>('/portal/invoices'));

  function handleSignOut() {
    const slug = getPortalCompanySlug();
    clearPortalToken();
    window.location.href = slug ? `/portal/${slug}/login` : '/';
  }

  return (
    <PortalShell companyName={dashboard?.company.name} logoUrl={dashboard?.company.logoUrl} primaryColor={dashboard?.company.primaryColor} secondaryColor={dashboard?.company.secondaryColor} onSignOut={handleSignOut}>
      <h1 className="text-2xl font-semibold text-slate-900">Invoices</h1>

      <div className="mt-6 rounded-xl border border-slate-200 bg-white p-5">
        {isLoading && (
          <div className="space-y-3">
            {[...Array(2)].map((_, i) => <div key={i} className="h-16 animate-pulse rounded-lg bg-slate-100" />)}
          </div>
        )}

        {error && !isLoading && <p className="py-10 text-center text-sm text-slate-500">We couldn't load your invoices right now. Please try refreshing.</p>}

        {!isLoading && !error && invoices?.length === 0 && (
          <div className="flex flex-col items-center justify-center rounded-lg border border-slate-100 bg-slate-50 py-16 text-center">
            <Receipt className="h-10 w-10 text-slate-300" aria-hidden="true" />
            <p className="mt-4 text-base font-semibold text-slate-900">No Invoices Yet</p>
            <p className="mt-1 text-sm text-slate-500">Invoices will appear here once a job is completed and billed.</p>
          </div>
        )}

        {!isLoading && !error && invoices && invoices.length > 0 && (
          <div className="divide-y divide-slate-100">
            {invoices.map((inv) => (
              <Link key={inv.id} href={`/portal/invoices/${inv.id}`} className="flex items-center justify-between gap-4 py-4 first:pt-0 last:pb-0 hover:bg-slate-50">
                <div className="min-w-0">
                  <p className="text-xs text-slate-400">{new Date(inv.createdAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
                  <p className="mt-0.5 flex items-center gap-2 font-semibold text-slate-900">
                    Invoice #{inv.invoiceNumber}
                    <StatusBadge status={inv.status} colorMap={INVOICE_STATUS_COLORS} />
                  </p>
                  {inv.dueDate && Number(inv.balanceDue) > 0 && (
                    <p className="mt-0.5 text-xs text-slate-400">
                      Due {new Date(inv.dueDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                    </p>
                  )}
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-semibold text-slate-900">{money(inv.totalAmount)}</p>
                  {Number(inv.balanceDue) > 0 && <p className="text-xs font-medium text-amber-600">{money(inv.balanceDue)} due</p>}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </PortalShell>
  );
}
