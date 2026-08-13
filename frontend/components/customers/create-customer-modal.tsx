'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { customersApi, CustomerProfile } from '../../lib/api/customers';
import { ApiError } from '../../lib/api/api-client';
import { CustomerForm, EMPTY_CUSTOMER_FORM_VALUES, type CustomerFormValues } from './customer-form';
import { PropertyFields, EMPTY_PROPERTY_FORM_VALUES, type PropertyFormValues } from './tabs/properties-tab';

/**
 * `includeProperty` defaults to false, so the Estimate Builder's
 * CustomerPicker (which never passes it) renders and behaves exactly as
 * it did before this feature existed — verified byte-identical for that
 * call site. Only the main Customers page opts into the combined flow.
 *
 * Retry-not-rollback design (see PROJECT_CONTEXT.md discussion): if
 * property creation fails after the customer was already created
 * successfully, the customer is kept — a customer without a property is
 * already a normal, supported state in this app — and the user gets an
 * explicit Retry Property / Skip for Now choice rather than a silent
 * half-completed workflow or an automatic rollback of a perfectly valid
 * customer record.
 */
export function CreateCustomerModal({
  onClose,
  onCreated,
  includeProperty = false,
}: {
  onClose: () => void;
  onCreated: (customer: CustomerProfile) => void;
  includeProperty?: boolean;
}) {
  const [propertyForm, setPropertyForm] = useState<PropertyFormValues>(EMPTY_PROPERTY_FORM_VALUES);
  // Once set, the customer already exists — we're past the point of no
  // return for that half of the flow, and only the property step is
  // still pending/retryable.
  const [createdCustomer, setCreatedCustomer] = useState<CustomerProfile | null>(null);
  const [propertyError, setPropertyError] = useState<string | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);

  function hasPropertyInput() {
    return Boolean(
      propertyForm.label.trim() || propertyForm.addressLine1.trim() || propertyForm.city.trim() || propertyForm.state.trim() || propertyForm.postalCode.trim(),
    );
  }

  function propertyFieldsIncomplete() {
    return !propertyForm.addressLine1.trim() || !propertyForm.city.trim() || !propertyForm.state.trim() || !propertyForm.postalCode.trim();
  }

  async function attemptCreateProperty(customer: CustomerProfile) {
    if (propertyFieldsIncomplete()) {
      setPropertyError('Address, city, state, and ZIP are needed to save a property.');
      return false;
    }
    try {
      await customersApi.createProperty(customer.id, propertyForm as any);
      return true;
    } catch (err) {
      setPropertyError(err instanceof ApiError ? err.message : 'Could not save the property.');
      return false;
    }
  }

  async function handleSubmit(values: CustomerFormValues, acknowledgedDuplicateWarning: boolean) {
    const created = await customersApi.create({
      customerType: values.customerType,
      firstName: values.firstName || undefined,
      lastName: values.lastName || undefined,
      businessName: values.businessName || undefined,
      email: values.email || undefined,
      phone: values.phone || undefined,
      source: values.source || undefined,
      acknowledgedDuplicateWarning,
    });

    // Customer creation is done at this point no matter what happens
    // next — nothing below this line can undo it, by design.
    if (!includeProperty || !hasPropertyInput()) {
      onCreated(created);
      return;
    }

    const propertySucceeded = await attemptCreateProperty(created);
    if (propertySucceeded) {
      onCreated(created);
    } else {
      setCreatedCustomer(created);
    }
  }

  async function handleRetryProperty() {
    if (!createdCustomer) return;
    setIsRetrying(true);
    setPropertyError(null);
    try {
      const succeeded = await attemptCreateProperty(createdCustomer);
      if (succeeded) onCreated(createdCustomer);
    } finally {
      setIsRetrying(false);
    }
  }

  function handleSkip() {
    if (createdCustomer) onCreated(createdCustomer);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-lg rounded-xl bg-white dark:bg-slate-900 p-6 shadow-xl">
        {createdCustomer ? (
          <>
            <div className="mb-4">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Customer created successfully.</h2>
              <p className="mt-1 text-sm text-amber-700 dark:text-amber-300">We couldn't save the property.</p>
              {propertyError && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{propertyError}</p>}
            </div>
            <div className="space-y-3">
              <PropertyFields values={propertyForm} onChange={setPropertyForm} required={false} />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={handleSkip}
                className="rounded-lg px-4 py-3 text-base font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-800 lg:py-2 lg:text-sm"
              >
                Skip for Now
              </button>
              <button
                type="button"
                onClick={handleRetryProperty}
                disabled={isRetrying}
                className="flex items-center gap-1.5 rounded-lg bg-[var(--color-brand)] px-4 py-3 text-base font-semibold text-white hover:bg-[var(--color-brand-dark)] disabled:opacity-50 lg:py-2 lg:text-sm"
              >
                {isRetrying && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {isRetrying ? 'Retrying…' : 'Retry Property'}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">New Customer</h2>
              <button onClick={onClose} className="text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:text-slate-400">
                ✕
              </button>
            </div>

            {includeProperty && <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Customer Information</p>}

            <CustomerForm
              mode="create"
              initialValues={EMPTY_CUSTOMER_FORM_VALUES}
              onSubmit={handleSubmit}
              onCancel={onClose}
              submitLabel="Create customer"
              submittingLabel="Creating…"
            >
              {includeProperty && (
                <div className="space-y-3 border-t border-slate-200 dark:border-slate-800 pt-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                    Property <span className="font-normal normal-case tracking-normal text-slate-400 dark:text-slate-500">(optional)</span>
                  </p>
                  <PropertyFields values={propertyForm} onChange={setPropertyForm} required={false} />
                </div>
              )}
            </CustomerForm>
          </>
        )}
      </div>
    </div>
  );
}
