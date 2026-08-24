'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { X } from 'lucide-react';
import { CustomerPicker } from '../estimates/CustomerPicker';
import { customersApi } from '../../lib/api/customers';
import { jobsApi } from '../../lib/api/jobs';
import { schedulingApi, CALENDAR_ITEM_TYPES, type CalendarAppointment } from '../../lib/api/scheduling';
import { ApiError } from '../../lib/api/api-client';

function toLocalDateInput(iso: string): string {
  return iso.slice(0, 10);
}
function toLocalTimeInput(iso: string): string {
  return new Date(iso).toTimeString().slice(0, 5);
}
function combine(date: string, time: string): string {
  return new Date(`${date}T${time}`).toISOString();
}
function defaultTimes() {
  const start = new Date();
  start.setMinutes(Math.ceil(start.getMinutes() / 15) * 15, 0, 0);
  const end = new Date(start.getTime() + 60 * 60000);
  return { date: start.toISOString().slice(0, 10), startTime: start.toTimeString().slice(0, 5), endTime: end.toTimeString().slice(0, 5) };
}

/**
 * Handles both create (existing is undefined) and edit (existing is a
 * real appointment) in one component — the fields and validation are
 * identical either way, and this avoids a second, near-duplicate form
 * for what the detail view's "Edit" action needs.
 */
export function CalendarItemModal({
  existing,
  onClose,
  onSaved,
  onDeleted,
}: {
  existing?: CalendarAppointment;
  onClose: () => void;
  onSaved: () => void;
  onDeleted?: () => void;
}) {
  const isEditing = !!existing;
  const initialTimes = existing
    ? { date: toLocalDateInput(existing.startsAt), startTime: toLocalTimeInput(existing.startsAt), endTime: toLocalTimeInput(existing.endsAt) }
    : defaultTimes();

  const [title, setTitle] = useState(existing?.title ?? '');
  const [appointmentType, setAppointmentType] = useState(existing?.appointmentType && existing.appointmentType !== 'job' ? existing.appointmentType : 'customer_meeting');
  const [date, setDate] = useState(initialTimes.date);
  const [startTime, setStartTime] = useState(initialTimes.startTime);
  const [endTime, setEndTime] = useState(initialTimes.endTime);
  const [customerId, setCustomerId] = useState(existing?.customerId ?? '');
  const [customerLabel, setCustomerLabel] = useState(existing?.customerId ? (existing.customerBusinessName ?? `${existing.customerFirstName ?? ''} ${existing.customerLastName ?? ''}`.trim()) : '');
  const [propertyId, setPropertyId] = useState(existing?.propertyId ?? '');
  const [jobId, setJobId] = useState(existing?.jobId && existing.appointmentType !== 'job' ? existing.jobId : '');
  const [location, setLocation] = useState(existing?.location ?? '');
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: customers } = useSWR('customers-for-calendar-item', () => customersApi.list({ pageSize: 100, sortBy: 'name', sortDir: 'asc' }));
  // Only fetched once a customer is actually selected — properties and
  // jobs are both customer-scoped, and there's nothing to choose from
  // until then.
  const { data: customerProfile } = useSWR(customerId ? ['customer-profile-for-calendar-item', customerId] : null, () => customersApi.get(customerId));
  const { data: customerJobs } = useSWR(customerId ? ['jobs-for-calendar-item', customerId] : null, () => jobsApi.list({ customerId }));

  // A property or job selected under one customer shouldn't silently
  // carry over if the customer is then changed to someone else.
  function handleCustomerChange(id: string, label: string) {
    setCustomerId(id);
    setCustomerLabel(label);
    setPropertyId('');
    setJobId('');
  }

  async function handleSave() {
    if (!title.trim()) return setError('Title is required.');
    const startsAt = combine(date, startTime);
    const endsAt = combine(date, endTime);
    if (new Date(endsAt) <= new Date(startsAt)) return setError('End time must be after start time.');

    setIsSaving(true);
    setError(null);
    try {
      if (isEditing) {
        await schedulingApi.updateCalendarItem(existing!.id, {
          title: title.trim(),
          appointmentType,
          startsAt,
          endsAt,
          customerId: customerId || null,
          propertyId: propertyId || null,
          jobId: jobId || null,
          location: location.trim() || null,
          notes: notes.trim() || null,
        });
      } else {
        await schedulingApi.createCalendarItem({
          title: title.trim(),
          appointmentType,
          startsAt,
          endsAt,
          customerId: customerId || undefined,
          propertyId: propertyId || undefined,
          jobId: jobId || undefined,
          location: location.trim() || undefined,
          notes: notes.trim() || undefined,
        });
      }
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save this calendar item.');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete() {
    if (!existing || !onDeleted) return;
    setIsSaving(true);
    setError(null);
    try {
      await schedulingApi.unschedule(existing.id);
      onDeleted();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not delete this calendar item.');
      setIsSaving(false);
    }
  }

  const properties = customerProfile?.properties ?? [];

  return (
    <div className="fixed inset-0 z-[9999] flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <div
        className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-t-2xl sm:rounded-2xl bg-white dark:bg-slate-900 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 px-5 py-4">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">{isEditing ? 'Edit Calendar Item' : 'New Calendar Item'}</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Roof inspection, Meet with customer"
              className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-3 text-base lg:py-2 lg:text-sm dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-400"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Appointment Type</label>
            <select
              value={appointmentType}
              onChange={(e) => setAppointmentType(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-3 text-base lg:py-2 lg:text-sm dark:bg-slate-900 dark:text-slate-100"
            >
              {CALENDAR_ITEM_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Customer <span className="font-normal text-slate-400">(optional)</span></label>
            <CustomerPicker
              customers={customers?.data ?? []}
              value={customerId}
              selectedLabel={customerLabel}
              onSelect={handleCustomerChange}
              onCreated={(c) => handleCustomerChange(c.id, c.businessName ?? `${c.firstName ?? ''} ${c.lastName ?? ''}`.trim())}
            />
            {customerId && (
              <button type="button" onClick={() => handleCustomerChange('', '')} className="mt-1 text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
                Clear customer
              </button>
            )}
          </div>

          {customerId && properties.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Property <span className="font-normal text-slate-400">(optional)</span></label>
              <select
                value={propertyId}
                onChange={(e) => setPropertyId(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-3 text-base lg:py-2 lg:text-sm dark:bg-slate-900 dark:text-slate-100"
              >
                <option value="">No property selected</option>
                {properties.map((p) => (
                  <option key={p.id} value={p.id}>{p.label ? `${p.label} — ` : ''}{p.addressLine1}, {p.city}</option>
                ))}
              </select>
            </div>
          )}

          {customerId && customerJobs && customerJobs.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Job <span className="font-normal text-slate-400">(optional)</span></label>
              <select
                value={jobId}
                onChange={(e) => setJobId(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-3 text-base lg:py-2 lg:text-sm dark:bg-slate-900 dark:text-slate-100"
              >
                <option value="">No job selected</option>
                {customerJobs.map((j) => (
                  <option key={j.id} value={j.id}>{j.jobNumber} — {j.title}</option>
                ))}
              </select>
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Date</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-3 text-base lg:py-2 lg:text-sm dark:bg-slate-900 dark:text-slate-100" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Start Time</label>
              <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-3 text-base lg:py-2 lg:text-sm dark:bg-slate-900 dark:text-slate-100" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">End Time</label>
              <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-3 text-base lg:py-2 lg:text-sm dark:bg-slate-900 dark:text-slate-100" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Location <span className="font-normal text-slate-400">(optional)</span></label>
            {customerId && propertyId ? (
              <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">Using the selected property&apos;s address.</p>
            ) : (
              <input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Address or meeting location"
                className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-3 text-base lg:py-2 lg:text-sm dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-400"
              />
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Notes <span className="font-normal text-slate-400">(optional)</span></label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="e.g. Customer wants an estimate for roof cleaning."
              className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 text-sm dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-400"
            />
          </div>
        </div>

        <div className="flex items-center gap-2 border-t border-slate-100 dark:border-slate-800 px-5 py-3">
          {isEditing && onDeleted && (
            <button onClick={handleDelete} disabled={isSaving} className="rounded-lg border border-red-200 dark:border-red-900 px-4 py-2.5 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950 disabled:opacity-50">
              Delete
            </button>
          )}
          <button onClick={handleSave} disabled={isSaving} className="ml-auto rounded-lg bg-[var(--color-brand)] px-4 py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">
            {isSaving ? 'Saving…' : isEditing ? 'Save Changes' : 'Create Calendar Item'}
          </button>
        </div>
      </div>
    </div>
  );
}
