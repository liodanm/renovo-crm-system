import { apiFetch } from './api-client';

export interface CalendarAppointment {
  id: string;
  appointmentType: string;
  startsAt: string;
  endsAt: string;
  allDay: boolean;
  status: string;
  arrivalWindowMinutes: number | null;
  resolvedArrivalWindowMinutes: number;
  jobId: string | null;
  estimateId: string | null;
  title: string;
  location: string | null;
  notes: string | null;
  customerId: string | null;
  customerFirstName: string | null;
  customerLastName: string | null;
  customerBusinessName: string | null;
  customerPhone: string | null;
  propertyId: string | null;
  propertyAddressLine1: string | null;
  propertyCity: string | null;
  propertyState: string | null;
  propertyLatitude: string | null;
  propertyLongitude: string | null;
  assignedCompanyUserId: string | null;
  technicianFirstName: string | null;
  technicianLastName: string | null;
  jobStatus: string | null;
  jobPrice: string | null;
  jobNumber: string | null;
  services: string[];
  cancellationReason: string | null;
}

export interface ScheduleJobInput {
  startsAt: string;
  endsAt: string;
  arrivalWindowMinutes?: number;
  assignedUserId?: string;
}

export interface CreateCalendarItemInput {
  title: string;
  appointmentType: string;
  startsAt: string;
  endsAt: string;
  customerId?: string;
  propertyId?: string;
  jobId?: string;
  assignedUserId?: string;
  location?: string;
  notes?: string;
}

export interface UpdateCalendarItemInput {
  title?: string;
  appointmentType?: string;
  startsAt?: string;
  endsAt?: string;
  customerId?: string | null;
  propertyId?: string | null;
  jobId?: string | null;
  assignedUserId?: string | null;
  location?: string | null;
  notes?: string | null;
}

export const schedulingApi = {
  getCalendar: (params: { start: string; end: string; status?: string; assignedUserId?: string; search?: string }) => {
    const entries = Object.entries(params).filter(([, v]) => v);
    const query = '?' + entries.map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&');
    return apiFetch<CalendarAppointment[]>(`/scheduling/calendar${query}`);
  },
  getAppointment: (id: string) => apiFetch<CalendarAppointment>(`/scheduling/appointments/${id}`),
  scheduleJob: (jobId: string, input: ScheduleJobInput) =>
    apiFetch<CalendarAppointment>(`/scheduling/jobs/${jobId}`, { method: 'POST', body: JSON.stringify(input) }),
  reschedule: (appointmentId: string, input: { startsAt: string; endsAt: string }) =>
    apiFetch<CalendarAppointment>(`/scheduling/appointments/${appointmentId}/reschedule`, { method: 'PATCH', body: JSON.stringify(input) }),
  updateAssignment: (appointmentId: string, input: { assignedUserId?: string; arrivalWindowMinutes?: number }) =>
    apiFetch<CalendarAppointment>(`/scheduling/appointments/${appointmentId}/assignment`, { method: 'PATCH', body: JSON.stringify(input) }),
  unschedule: (appointmentId: string) => apiFetch<{ success: boolean }>(`/scheduling/appointments/${appointmentId}`, { method: 'DELETE' }),
  cancel: (appointmentId: string, reason?: string) =>
    apiFetch<CalendarAppointment>(`/scheduling/appointments/${appointmentId}/cancel`, { method: 'POST', body: JSON.stringify({ reason }) }),
  createCalendarItem: (input: CreateCalendarItemInput) =>
    apiFetch<CalendarAppointment>('/scheduling/calendar-items', { method: 'POST', body: JSON.stringify(input) }),
  updateCalendarItem: (appointmentId: string, input: UpdateCalendarItemInput) =>
    apiFetch<CalendarAppointment>(`/scheduling/calendar-items/${appointmentId}`, { method: 'PATCH', body: JSON.stringify(input) }),
};

export const APPOINTMENT_STATUS_COLORS: Record<string, string> = {
  scheduled: 'bg-blue-500',
  confirmed: 'bg-cyan-500',
  completed: 'bg-emerald-500',
  cancelled: 'bg-red-400',
  no_show: 'bg-amber-500',
};

export const APPOINTMENT_STATUS_LABELS: Record<string, string> = {
  scheduled: 'Scheduled',
  confirmed: 'Confirmed',
  completed: 'Completed',
  cancelled: 'Cancelled',
  no_show: 'No Show',
};

// Renovo's terminology distinction (see docs): a JOB is real work being
// performed; a CALENDAR ITEM is something that needs to happen on the
// calendar and may have no Job, Customer, or Property at all. 'job'
// itself isn't offered as a selectable type here — that one is only
// ever set by scheduleJob() when an appointment is generated FROM a
// real Job, not chosen freely from this list.
export const CALENDAR_ITEM_TYPES: { value: string; label: string }[] = [
  { value: 'customer_meeting', label: 'Customer Meeting' },
  { value: 'estimate_visit', label: 'Estimate / Quote' },
  { value: 'property_inspection', label: 'Property Inspection' },
  { value: 'job_check', label: 'Job / Project Check' },
  { value: 'follow_up', label: 'Follow-Up' },
  { value: 'consultation', label: 'Consultation' },
  { value: 'pickup_delivery', label: 'Pickup / Delivery' },
  { value: 'other', label: 'Other' },
];

export const APPOINTMENT_TYPE_LABELS: Record<string, string> = {
  job: 'Job',
  ...Object.fromEntries(CALENDAR_ITEM_TYPES.map((t) => [t.value, t.label])),
};

export function appointmentCustomerName(a: CalendarAppointment): string {
  return a.customerBusinessName ?? (`${a.customerFirstName ?? ''} ${a.customerLastName ?? ''}`.trim() || 'No customer');
}

