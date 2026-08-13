'use client';

import Link from 'next/link';
import { AppShell } from '../../../components/layout/AppShell';
import { ServiceCatalogForm } from '../../../components/service-catalog/ServiceCatalogForm';

export default function NewServiceCatalogItemPage() {
  return (
    <AppShell>
      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6 lg:py-8">
        <Link href="/service-catalog" className="text-sm text-slate-500 dark:text-slate-400 hover:text-slate-800">← Back to Service Catalog</Link>
        <h1 className="mt-2 text-xl font-semibold text-slate-900 dark:text-slate-100">New Service</h1>
        <div className="mt-4">
          <ServiceCatalogForm />
        </div>
      </main>
    </AppShell>
  );
}
