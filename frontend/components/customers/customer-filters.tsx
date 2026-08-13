'use client';

import { CustomerQueryParams } from '../../lib/api/customers';

export function CustomerFilters({
  filters,
  onChange,
}: {
  filters: CustomerQueryParams;
  onChange: (next: CustomerQueryParams) => void;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <div className="relative flex-1">
        <svg
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m21 21-4.3-4.3" />
        </svg>
        <input
          type="text"
          placeholder="Search by name, email, or phone…"
          value={filters.search ?? ''}
          onChange={(e) => onChange({ ...filters, search: e.target.value, page: 1 })}
          className="w-full rounded-lg border border-slate-300 dark:border-slate-700 py-3 pl-9 pr-3 text-base focus:border-[var(--color-brand)] focus:outline-none focus:ring-2 focus:ring-[var(--color-brand)]/20 lg:py-2 lg:text-sm dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-400"
        />
      </div>

      <select
        value={filters.leadStatus ?? ''}
        onChange={(e) => onChange({ ...filters, leadStatus: e.target.value || undefined, page: 1 })}
        className="rounded-lg border border-slate-300 dark:border-slate-700 py-3 pl-3 pr-8 text-base lg:py-2 lg:text-sm text-slate-700 dark:text-slate-100 focus:border-[var(--color-brand)] focus:outline-none dark:bg-slate-900 dark:placeholder:text-slate-400"
      >
        <option value="">All statuses</option>
        <option value="lead">Lead</option>
        <option value="active">Active</option>
        <option value="inactive">Inactive</option>
        <option value="archived">Archived</option>
        <option value="churned">Churned</option>
      </select>

      <select
        value={filters.customerType ?? ''}
        onChange={(e) => onChange({ ...filters, customerType: e.target.value || undefined, page: 1 })}
        className="rounded-lg border border-slate-300 dark:border-slate-700 py-3 pl-3 pr-8 text-base lg:py-2 lg:text-sm text-slate-700 dark:text-slate-100 focus:border-[var(--color-brand)] focus:outline-none dark:bg-slate-900 dark:placeholder:text-slate-400"
      >
        <option value="">Residential & Commercial</option>
        <option value="residential">Residential</option>
        <option value="commercial">Commercial</option>
      </select>

      <select
        value={filters.sortBy ?? 'createdAt'}
        onChange={(e) => onChange({ ...filters, sortBy: e.target.value, page: 1 })}
        className="rounded-lg border border-slate-300 dark:border-slate-700 py-3 pl-3 pr-8 text-base lg:py-2 lg:text-sm text-slate-700 dark:text-slate-100 focus:border-[var(--color-brand)] focus:outline-none dark:bg-slate-900 dark:placeholder:text-slate-400"
      >
        <option value="createdAt">Newest first</option>
        <option value="updatedAt">Recently updated</option>
        <option value="name">Name</option>
        <option value="lifetimeValue">Lifetime value</option>
      </select>
    </div>
  );
}
