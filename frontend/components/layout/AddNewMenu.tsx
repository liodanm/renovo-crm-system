'use client';

import { useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Plus, UserPlus, FileText, CalendarPlus } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from '../ui/dropdown-menu';
import { CalendarItemModal } from '../scheduling/CalendarItemModal';
import { CreateCustomerModal } from '../customers/create-customer-modal';

/**
 * Three actions used most when working in front of a customer, reachable
 * from every page via the global header.
 *
 * Real bug fixed here: all three previously either navigated away
 * immediately (Customer, Estimate) or force-navigated on save
 * regardless of where the user actually was (Calendar Item always sent
 * you to /scheduling even from Dashboard/Customers/anywhere else) —
 * reported directly, confirmed by reading the code, not assumed.
 *
 * Customer and Calendar Item are both now genuinely in-context: neither
 * navigates away to open, and closing/saving returns you to exactly
 * the page you were already on — no navigation at all, since both now
 * render their existing modal inline right here rather than routing to
 * a dedicated page. Estimate remains a real page navigation (it's a
 * substantial multi-line-item form, not something to cram into a
 * header dropdown as a modal) — but Cancel now returns to the original
 * page instead of the estimates list, via a `returnTo` param the
 * estimate form reads and falls back to its old behavior when absent,
 * so no other caller of that page is affected.
 */
export function AddNewMenu() {
  const router = useRouter();
  const pathname = usePathname();
  const [showCalendarItem, setShowCalendarItem] = useState(false);
  const [showCreateCustomer, setShowCreateCustomer] = useState(false);

  return (
    <>
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
          <DropdownMenuItem onSelect={() => setShowCreateCustomer(true)} className="py-2.5">
            <UserPlus className="h-4 w-4 text-slate-400" />
            Customer
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => router.push(`/estimates/new?returnTo=${encodeURIComponent(pathname)}`)} className="py-2.5">
            <FileText className="h-4 w-4 text-slate-400" />
            Estimate
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setShowCalendarItem(true)} className="py-2.5">
            <CalendarPlus className="h-4 w-4 text-slate-400" />
            Calendar Item
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {showCalendarItem && (
        <CalendarItemModal
          onClose={() => setShowCalendarItem(false)}
          onSaved={() => setShowCalendarItem(false)}
        />
      )}

      {showCreateCustomer && (
        <CreateCustomerModal
          includeProperty
          onClose={() => setShowCreateCustomer(false)}
          onCreated={() => setShowCreateCustomer(false)}
        />
      )}
    </>
  );
}
