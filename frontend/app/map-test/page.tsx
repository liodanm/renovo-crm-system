'use client';

// DIAGNOSTIC ONLY — see MinimalMapDiagnostic.tsx for what this is for
// and when to delete it. Not linked from any nav.

import dynamic from 'next/dynamic';

const MinimalMapDiagnostic = dynamic(
  () => import('../../components/quote/MinimalMapDiagnostic').then((m) => m.MinimalMapDiagnostic),
  { ssr: false }
);

export default function MapTestPage() {
  return <MinimalMapDiagnostic />;
}
