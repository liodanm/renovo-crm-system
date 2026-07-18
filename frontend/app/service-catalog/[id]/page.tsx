'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import useSWR from 'swr';
import { AppShell } from '../../../components/layout/AppShell';
import { ServiceCatalogForm } from '../../../components/service-catalog/ServiceCatalogForm';
import { serviceCatalogApi } from '../../../lib/api/service-catalog';

export default function EditServiceCatalogItemPage() {
  const params = useParams<{ id: string }>();
  const { data: item, error, isLoading } = useSWR(['service-catalog-item', params.id], () => serviceCatalogApi.get(params.id));

  return (
    <AppShell>
      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6 lg:py-8">
        <Link href="/service-catalog" className="text-sm text-slate-500 hover:text-slate-800">← Back to Service Catalog</Link>
        {isLoading && <p className="mt-4 text-sm text-slate-500">Loading…</p>}
        {error && <p className="mt-4 text-sm text-red-600">Couldn't load this service.</p>}
        {item && (
          <>
            <h1 className="mt-2 text-xl font-semibold text-slate-900">{item.name}</h1>
            <div className="mt-4">
              <ServiceCatalogForm existing={item} />
            </div>
          </>
        )}
      </main>
    </AppShell>
  );
}
