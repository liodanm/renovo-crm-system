'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { CreateCustomerModal } from '../customers/create-customer-modal';
import { CustomerSummary, CustomerProfile } from '../../lib/api/customers';
import { getRecentCustomerIds, recordRecentCustomer } from '../../lib/hooks/use-recent-customers';

interface CustomerPickerProps {
  customers: CustomerSummary[];
  value: string;
  selectedLabel?: string; // display name for the current selection when it isn't in `customers` yet (freshly created)
  onSelect: (customerId: string, displayName: string) => void;
  onCreated: (customer: CustomerProfile) => void;
  hasError?: boolean;
}

function matchesSearch(c: CustomerSummary, term: string): boolean {
  const haystack = `${c.displayName} ${c.phone ?? ''} ${c.email ?? ''} ${c.primaryLocation ?? ''}`.toLowerCase();
  return haystack.includes(term);
}

export function CustomerPicker({ customers, value, selectedLabel, onSelect, onCreated, hasError }: CustomerPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setIsOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const orderedResults = useMemo(() => {
    const term = search.trim().toLowerCase();
    const filtered = term ? customers.filter((c) => matchesSearch(c, term)) : customers;

    if (term) {
      // While actively searching, relevance (a plain filter) matters more
      // than recency — don't re-sort search results by recent-use.
      return filtered;
    }

    // No search yet: recently used first, then most recently created,
    // then alphabetical — exactly the three-tier order requested, all
    // computed client-side from data already fetched.
    const recentIds = getRecentCustomerIds();
    const recentRank = new Map(recentIds.map((id, i) => [id, i]));
    return [...filtered].sort((a, b) => {
      const aRecent = recentRank.get(a.id);
      const bRecent = recentRank.get(b.id);
      if (aRecent !== undefined && bRecent !== undefined) return aRecent - bRecent;
      if (aRecent !== undefined) return -1;
      if (bRecent !== undefined) return 1;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [customers, search]);

  function handlePick(customer: CustomerSummary) {
    recordRecentCustomer(customer.id);
    onSelect(customer.id, customer.displayName);
    setIsOpen(false);
    setSearch('');
  }

  function handleCreated(customer: CustomerProfile) {
    recordRecentCustomer(customer.id);
    setShowCreate(false);
    onCreated(customer);
  }

  const displayValue = isOpen ? search : selectedLabel ?? '';

  return (
    <div ref={containerRef} className="relative">
      <input
        value={displayValue}
        onChange={(e) => {
          setSearch(e.target.value);
          if (!isOpen) setIsOpen(true);
        }}
        onFocus={() => setIsOpen(true)}
        placeholder="Search name, phone, email…"
        className={`mt-1 w-full rounded-lg border px-3 py-3 text-base lg:px-3 lg:py-2 lg:text-sm ${hasError ? 'border-red-400' : 'border-slate-300 dark:border-slate-700'} dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-400`}
      />

      {isOpen && (
        <div className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-lg">
          <button
            type="button"
            onClick={() => { setIsOpen(false); setShowCreate(true); }}
            className="block w-full border-b border-slate-100 dark:border-slate-800 px-3 py-2.5 text-left text-sm font-semibold text-[var(--color-brand)] hover:bg-slate-50 dark:bg-slate-800 dark:hover:bg-slate-800"
          >
            + New Customer
          </button>
          {orderedResults.length === 0 && (
            <p className="px-3 py-3 text-sm text-slate-400 dark:text-slate-500">No customers match "{search}".</p>
          )}
          {orderedResults.slice(0, 30).map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => handlePick(c)}
              className={`block w-full px-3 py-2 text-left text-sm hover:bg-slate-50 dark:bg-slate-800 dark:hover:bg-slate-800 ${c.id === value ? 'bg-slate-50 dark:bg-slate-800 font-medium' : ''}`}
            >
              <span className="text-slate-800 dark:text-slate-100">{c.displayName}</span>
              {(c.phone || c.primaryLocation) && (
                <span className="ml-1.5 text-xs text-slate-400 dark:text-slate-500">{[c.phone, c.primaryLocation].filter(Boolean).join(' · ')}</span>
              )}
            </button>
          ))}
        </div>
      )}

      {showCreate && <CreateCustomerModal onClose={() => setShowCreate(false)} onCreated={handleCreated} />}
    </div>
  );
}
