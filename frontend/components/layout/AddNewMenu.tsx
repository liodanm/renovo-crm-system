'use client';

import { useRouter } from 'next/navigation';
import { Plus, UserPlus, FileText, CalendarDays } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from '../ui/dropdown-menu';

/**
 * The three actions used most when working in front of a customer.
 * Each one reuses an existing route/workflow exactly — no new form, no
 * new endpoint:
 * - New Customer → /customers?new=true, which the Customers page reads
 *   to open its own existing create-customer modal (same modal the
 *   page's own "+ New Customer" button already opens).
 * - New Quote → /estimates/new, the existing estimate creation page.
 * - Schedule → /scheduling, the existing calendar.
 */
export function AddNewMenu() {
  const router = useRouter();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Add new"
          className="flex h-11 shrink-0 items-center gap-1.5 rounded-lg bg-[var(--color-brand)] px-3 text-sm font-semibold text-white hover:bg-[var(--color-brand-dark)] lg:h-9"
        >
          Add New
          <Plus className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuLabel>Add New</DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => router.push('/customers?new=true')} className="py-2.5">
          <UserPlus className="h-4 w-4 text-slate-400" />
          New Customer
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => router.push('/estimates/new')} className="py-2.5">
          <FileText className="h-4 w-4 text-slate-400" />
          New Quote
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => router.push('/scheduling')} className="py-2.5">
          <CalendarDays className="h-4 w-4 text-slate-400" />
          Schedule
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
