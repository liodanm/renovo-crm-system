'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import { SERVICE_TYPES } from '../../lib/api/estimates';
import { SERVICE_TYPE_ICONS } from '../../lib/api/service-catalog';

interface ServicePickerProps {
  /** Current serviceType — one of the 12 real, DB-constrained values. */
  value: string;
  /** Current description — needed to correctly show the real name when
      value is 'other' (a custom service is meaningless displayed as
      just "Other"). */
  description: string;
  /** Predefined pick: only serviceType changes, exactly matching the
      plain <select> this replaces — description is deliberately left
      untouched, same as before. Custom pick: both serviceType ('other')
      and description (the typed text) are set together. */
  onSelect: (serviceType: string, descriptionOverride?: string) => void;
  hasError?: boolean;
}

function matchesSearch(label: string, term: string): boolean {
  return label.toLowerCase().includes(term);
}

export function ServicePicker({ value, description, onSelect, hasError }: ServicePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setIsOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const results = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return SERVICE_TYPES;
    return SERVICE_TYPES.filter((s) => matchesSearch(s.label, term));
  }, [search]);

  // A custom-entry option only makes sense once there's real typed text,
  // and only when it isn't already an exact match for a real predefined
  // label (typing "Driveway Cleaning" verbatim should just let you pick
  // the real thing, not offer to create a duplicate custom one).
  const trimmedSearch = search.trim();
  const exactMatch = SERVICE_TYPES.some((s) => s.label.toLowerCase() === trimmedSearch.toLowerCase());
  const showCustomOption = trimmedSearch.length > 0 && !exactMatch;

  // The current selection's real, human-meaningful display value — for
  // 'other', that's the actual custom name (description), not the
  // generic "Other" label, which would be uninformative when re-opening
  // an existing custom line item for editing.
  const isEmptyCustom = value === 'other' && !description.trim();
  const selectedLabel =
    value === 'other'
      ? description.trim()
      : SERVICE_TYPES.find((s) => s.value === value)?.label ?? value;

  const SelectedIcon = SERVICE_TYPE_ICONS[value] ?? SERVICE_TYPE_ICONS.other;

  function handlePickPredefined(serviceType: string) {
    onSelect(serviceType);
    setIsOpen(false);
    setSearch('');
  }

  function handlePickCustom() {
    onSelect('other', trimmedSearch);
    setIsOpen(false);
    setSearch('');
  }

  // A freshly created custom line item (serviceType 'other', no
  // description yet) shows a genuinely empty field with an inviting
  // placeholder — "Other" alone was confusing, since it looked like a
  // real selected value rather than an invitation to type a name.
  const displayValue = isOpen ? search : isEmptyCustom ? '' : selectedLabel;
  const placeholderText = !isOpen && isEmptyCustom ? 'e.g. Custom House Cleaning' : 'Search or type service…';

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        {!isOpen && (
          <SelectedIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
        )}
        <input
          value={displayValue}
          onChange={(e) => {
            setSearch(e.target.value);
            if (!isOpen) setIsOpen(true);
          }}
          onFocus={(e) => {
            setIsOpen(true);
            // Clear the display value on focus so typing starts fresh
            // rather than editing/appending to the previous label —
            // matches CustomerPicker's exact behavior.
            setSearch('');
            e.target.select();
          }}
          placeholder={placeholderText}
          className={`mt-1 w-full rounded-lg border py-3 pr-3 text-base lg:py-2 lg:text-sm ${isOpen ? 'pl-3' : 'pl-9'} ${hasError ? 'border-red-400' : 'border-slate-300 dark:border-slate-700'} dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-400`}
        />
      </div>

      {isOpen && (
        <div className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-lg">
          {showCustomOption && (
            <button
              type="button"
              onClick={handlePickCustom}
              className="flex w-full items-center gap-2 border-b border-slate-100 dark:border-slate-800 px-3 py-2.5 text-left text-sm font-semibold text-[var(--color-brand)] hover:bg-slate-50 dark:bg-slate-800 dark:hover:bg-slate-800"
            >
              <Plus className="h-4 w-4 shrink-0" />
              Use &ldquo;{trimmedSearch}&rdquo;
            </button>
          )}
          {results.length === 0 && !showCustomOption && (
            <p className="px-3 py-3 text-sm text-slate-400 dark:text-slate-500">No services match &ldquo;{search}&rdquo;.</p>
          )}
          {results.map((s) => {
            const Icon = SERVICE_TYPE_ICONS[s.value] ?? SERVICE_TYPE_ICONS.other;
            return (
              <button
                key={s.value}
                type="button"
                onClick={() => handlePickPredefined(s.value)}
                className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50 dark:bg-slate-800 dark:hover:bg-slate-800 ${s.value === value ? 'bg-slate-50 dark:bg-slate-800 font-medium' : ''}`}
              >
                <Icon className="h-4 w-4 shrink-0 text-slate-400 dark:text-slate-500" />
                <span className="text-slate-800 dark:text-slate-100">{s.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
