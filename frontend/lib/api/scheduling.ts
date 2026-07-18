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
}

export interface ScheduleJobInput {
  startsAt: string;
  endsAt: string;
  arrivalWindowMinutes?: number;
  assignedUserId?: string;
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

export function appointmentCustomerName(a: CalendarAppointment): string {
  return a.customerBusinessName ?? (`${a.customerFirstName ?? ''} ${a.customerLastName ?? ''}`.trim() || 'Unknown');
}
