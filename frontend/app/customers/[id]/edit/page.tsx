'use client';

import { useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import useSWR from 'swr';
import { customersApi } from '../../../../lib/api/customers';
import { ApiError } from '../../../../lib/api/api-client';
import { CustomerForm, type CustomerFormValues } from '../../../../components/customers/customer-form';
import { SettingsSectionShell } from '../../../../components/settings/SettingsSectionShell';
import { CardSkeleton, CardError } from '../../../../components/dashboard/dashboard-card';
import { AppShell } from '../../../../components/layout/AppShell';

// How long the "Customer updated successfully" toast stays visible
// before navigating back — long enough to register as confirmation,
// short enough not to feel like a stall.
const SUCCESS_DISPLAY_MS = 700;

export default function EditCustomerPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const customerId = params.id;

  const { data: customer, error: loadError, isLoading } = useSWR([`customer`, customerId], () => customersApi.get(customerId));

  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  if (isLoading) {
    return (
      <AppShell>
        <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6 lg:py-8">
          <CardSkeleton lines={6} />
        </main>
      </AppShell>
    );
  }

  if (loadError || !customer) {
    return (
      <AppShell>
        <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6 lg:py-8">
          <CardError message="Couldn't load this customer" />
        </main>
      </AppShell>
    );
  }

  const initialValues: CustomerFormValues = {
    customerType: customer.customerType,
    firstName: customer.firstName ?? '',
    lastName: customer.lastName ?? '',
    businessName: customer.businessName ?? '',
    email: customer.email ?? '',
    phone: customer.phone ?? '',
    secondaryPhone: customer.secondaryPhone ?? '',
    leadStatus: customer.leadStatus,
    source: customer.source ?? '',
  };

  async function handleSubmit(values: CustomerFormValues, acknowledgedDuplicateWarning: boolean) {
    setIsSaving(true);
    setSaveError(null);
    try {
      await customersApi.update(customerId, {
        customerType: values.customerType,
        firstName: values.firstName || undefined,
        lastName: values.lastName || undefined,
        businessName: values.businessName || undefined,
        email: values.email || undefined,
        phone: values.phone || undefined,
        secondaryPhone: values.secondaryPhone || undefined,
        leadStatus: values.leadStatus,
        source: values.source || undefined,
        acknowledgedDuplicateWarning,
      });
      // Let isSaving flip to false (via the finally block below) and the
      // shell's own success toast render and actually be seen, before
      // navigating away — otherwise the navigation unmounts this page in
      // the same tick and the confirmation is never visible.
      setIsSaving(false);
      await new Promise((resolve) => setTimeout(resolve, SUCCESS_DISPLAY_MS));
      router.push(`/customers/${customerId}`);
      return;
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : 'Something went wrong.');
      throw err;
    } finally {
      setIsSaving(false);
    }
  }

  const displayName = customer.businessName || `${customer.firstName ?? ''} ${customer.lastName ?? ''}`.trim() || 'Customer';

  return (
    <AppShell>
      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6 lg:py-8">
        <SettingsSectionShell
          title={`Edit ${displayName}`}
          description="Changes save back to this customer's record."
          hasUnsavedChanges={isDirty}
          isSaving={isSaving}
          error={saveError}
          onSave={() => formRef.current?.requestSubmit()}
          onCancel={() => router.push(`/customers/${customerId}`)}
          successMessage="Customer updated successfully"
          alwaysShowBar
        >
          <CustomerForm
            mode="edit"
            initialValues={initialValues}
            onSubmit={handleSubmit}
            onCancel={() => router.push(`/customers/${customerId}`)}
            submitLabel="Save Changes"
            submittingLabel="Saving…"
            showLeadStatusAndSecondaryPhone
            onDirtyChange={setIsDirty}
            hideActions
            formRef={formRef}
          />
        </SettingsSectionShell>
      </main>
    </AppShell>
  );
}
