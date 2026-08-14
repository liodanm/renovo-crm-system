'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { Search, X } from 'lucide-react';
import { searchApi, searchDisplayName } from '../../lib/api/search';

const DEBOUNCE_MS = 300;

type FlatResult =
  | { kind: 'customer'; id: string; label: string; sublabel: string; href: string }
  | { kind: 'estimate'; id: string; label: string; sublabel: string; href: string }
  | { kind: 'invoice'; id: string; label: string; sublabel: string; href: string }
  | { kind: 'job'; id: string; label: string; sublabel: string; href: string };

const KIND_LABELS: Record<FlatResult['kind'], string> = {
  customer: 'Customers',
  estimate: 'Estimates',
  invoice: 'Invoices',
  job: 'Jobs',
};

export function GlobalSearch() {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  useEffect(() => {
    // Never fires a request for an empty/whitespace-only field — the
    // timer itself still runs (cheap), but debouncedQuery only ever
    // becomes a real value, so useSWR's key below stays null and skips
    // the fetch entirely rather than sending an empty-string query.
    const trimmed = query.trim();
    const timer = setTimeout(() => setDebouncedQuery(trimmed), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  const { data, isLoading } = useSWR(
    debouncedQuery ? ['global-search', debouncedQuery] : null,
    () => searchApi.global(debouncedQuery),
  );

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const results: FlatResult[] = data
    ? [
        ...data.customers.map((c) => ({
          kind: 'customer' as const,
          id: c.id,
          label: searchDisplayName(c),
          sublabel: c.phone ?? c.email ?? '',
          href: `/customers/${c.id}`,
        })),
        ...data.estimates.map((e) => ({
          kind: 'estimate' as const,
          id: e.id,
          label: e.estimateNumber,
          sublabel: searchDisplayName(e),
          href: `/estimates/${e.id}`,
        })),
        ...data.invoices.map((i) => ({
          kind: 'invoice' as const,
          id: i.id,
          label: i.invoiceNumber,
          sublabel: searchDisplayName(i),
          href: `/invoices/${i.id}`,
        })),
        ...data.jobs.map((j) => ({
          kind: 'job' as const,
          id: j.id,
          label: j.jobNumber,
          sublabel: `${j.title} · ${searchDisplayName(j)}`,
          href: `/jobs/${j.id}`,
        })),
      ]
    : [];

  function selectResult(result: FlatResult) {
    setIsOpen(false);
    setQuery('');
    setDebouncedQuery('');
    router.push(result.href);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!isOpen || results.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((prev) => (prev + 1) % results.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((prev) => (prev - 1 + results.length) % results.length);
    } else if (e.key === 'Enter' && activeIndex >= 0) {
      e.preventDefault();
      selectResult(results[activeIndex]);
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  }

  // Grouped for display — results itself stays flat for keyboard index
  // math, this just re-derives section headers from it.
  const grouped = (['customer', 'estimate', 'invoice', 'job'] as const)
    .map((kind) => ({ kind, items: results.filter((r) => r.kind === kind) }))
    .filter((g) => g.items.length > 0);

  return (
    <div ref={containerRef} className="relative w-full max-w-md">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
        <input
          value={query}
          onChange={(e) => { setQuery(e.target.value); setIsOpen(true); setActiveIndex(-1); }}
          onFocus={() => query.trim() && setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder="Search customers, estimates, invoices, jobs…"
          className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 py-2 pl-9 pr-8 text-base lg:text-sm placeholder:text-slate-400 dark:text-slate-100 focus:border-[var(--color-brand)] focus:outline-none focus:ring-1 focus:ring-[var(--color-brand)] dark:placeholder:text-slate-400"
        />
        {query && (
          <button
            onClick={() => { setQuery(''); setDebouncedQuery(''); setIsOpen(false); }}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:text-slate-400"
            aria-label="Clear search"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {isOpen && debouncedQuery && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-96 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-lg">
          {isLoading ? (
            <p className="px-4 py-6 text-center text-sm text-slate-500 dark:text-slate-400">Searching…</p>
          ) : results.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-slate-500 dark:text-slate-400">No results for &ldquo;{debouncedQuery}&rdquo;</p>
          ) : (
            grouped.map((group) => (
              <div key={group.kind}>
                <p className="px-4 pt-3 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">{KIND_LABELS[group.kind]}</p>
                {group.items.map((item) => {
                  const flatIndex = results.indexOf(item);
                  return (
                    <button
                      key={item.id}
                      onClick={() => selectResult(item)}
                      onMouseEnter={() => setActiveIndex(flatIndex)}
                      className={`flex w-full items-center justify-between px-4 py-2 text-left text-sm ${flatIndex === activeIndex ? 'bg-slate-100 dark:bg-slate-800' : 'hover:bg-slate-50 dark:bg-slate-800 dark:hover:bg-slate-800'}`}
                    >
                      <span className="font-medium text-slate-900 dark:text-slate-100">{item.label}</span>
                      <span className="ml-2 truncate text-xs text-slate-500 dark:text-slate-400">{item.sublabel}</span>
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
