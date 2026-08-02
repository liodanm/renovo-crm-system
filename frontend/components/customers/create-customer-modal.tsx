'use client';

import { customersApi, CustomerProfile } from '../../lib/api/customers';
import { CustomerForm, EMPTY_CUSTOMER_FORM_VALUES, type CustomerFormValues } from './customer-form';

export function CreateCustomerModal({ onClose, onCreated }: { onClose: () => void; onCreated: (customer: CustomerProfile) => void }) {
  async function handleSubmit(values: CustomerFormValues, acknowledgedDuplicateWarning: boolean) {
    const created = await customersApi.create({
      customerType: values.customerType,
      firstName: values.firstName || undefined,
      lastName: values.lastName || undefined,
      businessName: values.businessName || undefined,
      email: values.email || undefined,
      phone: values.phone || undefined,
      acknowledgedDuplicateWarning,
    });
    onCreated(created);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">New Customer</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            ✕
          </button>
        </div>

        <CustomerForm
          mode="create"
          initialValues={EMPTY_CUSTOMER_FORM_VALUES}
          onSubmit={handleSubmit}
          onCancel={onClose}
          submitLabel="Create customer"
          submittingLabel="Creating…"
        />
      </div>
    </div>
  );
}
