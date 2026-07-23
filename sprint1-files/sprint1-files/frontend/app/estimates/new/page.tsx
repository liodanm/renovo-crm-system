'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { EstimateForm } from '../../../components/estimates/EstimateForm';

function NewEstimateInner() {
  const searchParams = useSearchParams();
  const customerId = searchParams.get('customerId') ?? undefined;
  return <EstimateForm initialCustomerId={customerId} />;
}

export default function NewEstimatePage() {
  return (
    <Suspense fallback={null}>
      <NewEstimateInner />
    </Suspense>
  );
}
