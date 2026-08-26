import type { Metadata } from 'next';
import { QuoteWidgetClient } from './QuoteWidgetClient';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

/**
 * Server-side metadata fetch — separate from the client component's own
 * branding fetch (which drives the actual page UI). A failed fetch here
 * just falls back to a generic title rather than blocking the page;
 * QuoteWidgetClient's own error handling is what actually tells the
 * visitor if the page is genuinely unavailable.
 */
export async function generateMetadata({ params }: { params: { companySlug: string } }): Promise<Metadata> {
  try {
    const res = await fetch(`${API_BASE}/public/${params.companySlug}/quote-widget/branding`, { cache: 'no-store' });
    if (!res.ok) return { title: 'Get an Estimate' };
    const branding = await res.json();
    return { title: `Get an Estimate | ${branding.companyName}` };
  } catch {
    return { title: 'Get an Estimate' };
  }
}

export default function QuotePage({ params }: { params: { companySlug: string } }) {
  return <QuoteWidgetClient companySlug={params.companySlug} />;
}
