'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, UserPlus, FileText, CalendarPlus } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from '../ui/dropdown-menu';
import { CalendarItemModal } from '../scheduling/CalendarItemModal';

/**
 * Three actions used most when working in front of a customer. Customer
 * and Estimate reuse existing routes/workflows exactly — no new form,
 * no new endpoint. Calendar Item opens its form directly from here
 * (rather than navigating to /scheduling first) since this menu lives
 * in the global header and is reachable from any page — after saving,
 * it navigates to /scheduling so the new item is immediately visible
 * on the real calendar, not left unconfirmed.
 */
export function AddNewMenu() {
  const router = useRouter();
  const [showCalendarItem, setShowCalendarItem] = useState(false);

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
          <DropdownMenuItem onSelect={() => router.push('/customers?new=true')} className="py-2.5">
            <UserPlus className="h-4 w-4 text-slate-400" />
            Customer
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => router.push('/estimates/new')} className="py-2.5">
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
          onSaved={() => {
            setShowCalendarItem(false);
            router.push('/scheduling');
          }}
        />
      )}
    </>
  );
}
