import { apiFetch } from './api-client';

export interface JobLineItem {
  id: string;
  description: string;
  quantity: string;
  unitPrice: string;
  total: string;
  serviceType: string | null;
  unitOfMeasure: string | null;
  serviceDetails?: Record<string, unknown> | null;
  notes: string | null;
}

export interface JobStatusHistoryEntry {
  id: string;
  fromStatus: string | null;
  toStatus: string;
  note: string | null;
  changedAt: string;
  latitude: string | null;
  longitude: string | null;
}

export type JobPriority = 'normal' | 'follow_up' | 'high' | 'emergency';

export const JOB_PRIORITY_LABELS: Record<JobPriority, string> = {
  normal: 'Normal',
  follow_up: 'Follow-up',
  high: 'High Priority',
  emergency: 'Emergency',
};

// One shared mapping — badges, map pins, and any future priority UI all
// read from this instead of each defining their own color logic.
export const JOB_PRIORITY_COLORS: Record<JobPriority, { badge: string; dot: string }> = {
  normal: { badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300', dot: '#10b981' },
  follow_up: { badge: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300', dot: '#eab308' },
  high: { badge: 'bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300', dot: '#f97316' },
  emergency: { badge: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300', dot: '#ef4444' },
};

export interface Job {
  id: string;
  jobNumber: string;
  title: string;
  description: string | null;
  status: string;
  cancellationReason: string | null;
  priority: JobPriority;
  customerId: string;
  propertyId: string;
  estimateId: string | null;
  customerFirstName: string | null;
  customerLastName: string | null;
  customerBusinessName: string | null;
  propertyAddressLine1: string;
  propertyCity: string;
  propertyState: string;
  lineItems: JobLineItem[];
  statusHistory?: JobStatusHistoryEntry[];
  assignedUserId: string | null;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  actualStart: string | null;
  actualEnd: string | null;
  calculatedLaborHours: string | null;
  billableLaborHours: string | null;
  startLatitude: string | null;
  startLongitude: string | null;
  endLatitude: string | null;
  endLongitude: string | null;
  customerSignatureDataUrl: string | null;
  signatureUnavailableReason: string | null;
  completionNotes: string | null;
  recommendedFutureServices: string[];
  price: string;
  notes: string | null;
  internalNotes: string | null;
  createdAt: string;
}

export interface JobListItem {
  id: string;
  jobNumber: string;
  title: string;
  status: string;
  priority: JobPriority;
  price: string;
  customerId: string;
  propertyId: string;
  customerFirstName: string | null;
  customerLastName: string | null;
  customerBusinessName: string | null;
  propertyAddressLine1: string;
  propertyCity: string;
  propertyState: string;
  scheduledStart: string | null;
}

export interface UpdateJobInput {
  title?: string;
  description?: string;
  notes?: string;
  internalNotes?: string;
  scheduledStart?: string;
  scheduledEnd?: string;
  assignedUserId?: string;
  priority?: JobPriority;
}

export interface GpsCoords {
  latitude?: number;
  longitude?: number;
}

export interface JobChemicalUsage {
  id: string;
  chemicalName: string;
  quantity: string;
  unit: string;
  notes: string | null;
  createdAt: string;
}

export interface JobEquipmentUsage {
  id: string;
  equipmentName: string;
  notes: string | null;
  createdAt: string;
}

export interface JobPhoto {
  id: string;
  photoType: string;
  caption: string | null;
  mimeType: string | null;
  fileSizeBytes: string | null;
  takenAt: string | null;
  createdAt: string;
}

export interface JobAuditLogEntry {
  id: string;
  actionType: string;
  performedByUserId: string | null;
  latitude: string | null;
  longitude: string | null;
  previousValue: unknown;
  newValue: unknown;
  createdAt: string;
}

export interface CompleteJobInput extends GpsCoords {
  customerSignatureDataUrl?: string;
  signatureUnavailableReason?: 'customer_not_home' | 'commercial_property' | 'signature_declined';
  completionNotes?: string;
  recommendedFutureServices?: string[];
  billableLaborHours?: number;
  note?: string;
}

export const jobsApi = {
  list: (params?: { status?: string; customerId?: string; priority?: JobPriority }) => {
    const entries = params ? Object.entries(params).filter(([, v]) => v) : [];
    const query = entries.length ? '?' + entries.map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&') : '';
    return apiFetch<JobListItem[]>(`/jobs${query}`);
  },
  get: (id: string) => apiFetch<Job>(`/jobs/${id}`),
  update: (id: string, input: UpdateJobInput) => apiFetch<Job>(`/jobs/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
  start: (id: string, gps: GpsCoords) => apiFetch<Job>(`/jobs/${id}/start`, { method: 'POST', body: JSON.stringify(gps) }),
  pause: (id: string, note?: string) => apiFetch<Job>(`/jobs/${id}/pause`, { method: 'POST', body: JSON.stringify({ note }) }),
  resume: (id: string) => apiFetch<Job>(`/jobs/${id}/resume`, { method: 'POST' }),
  cancel: (id: string, cancellationReason: string) => apiFetch<Job>(`/jobs/${id}/cancel`, { method: 'POST', body: JSON.stringify({ cancellationReason }) }),
  complete: (id: string, input: CompleteJobInput) => apiFetch<Job>(`/jobs/${id}/complete`, { method: 'POST', body: JSON.stringify(input) }),
  checkIn: (id: string, gps: GpsCoords) => apiFetch<{ success: boolean; latitude: number | null; longitude: number | null }>(`/jobs/${id}/checkin`, { method: 'POST', body: JSON.stringify(gps) }),

  // Photos
  listPhotos: (jobId: string) => apiFetch<JobPhoto[]>(`/jobs/${jobId}/photos`),
  uploadPhoto: (jobId: string, file: File, photoType: string, caption: string | undefined, gps: GpsCoords) => {
    const form = new FormData();
    form.append('file', file);
    form.append('photoType', photoType);
    if (caption) form.append('caption', caption);
    if (gps.latitude != null) form.append('latitude', String(gps.latitude));
    if (gps.longitude != null) form.append('longitude', String(gps.longitude));
    return apiFetch<JobPhoto>(`/jobs/${jobId}/photos`, { method: 'POST', body: form });
  },
  photoFileUrl: (jobId: string, photoId: string) => `${process.env.NEXT_PUBLIC_API_URL}/jobs/${jobId}/photos/${photoId}/file`,
  deletePhoto: (jobId: string, photoId: string, gps: GpsCoords) =>
    apiFetch<{ success: boolean }>(`/jobs/${jobId}/photos/${photoId}`, { method: 'DELETE', body: JSON.stringify(gps) }),

  // Chemicals
  listChemicals: (jobId: string) => apiFetch<JobChemicalUsage[]>(`/jobs/${jobId}/chemicals`),
  addChemical: (jobId: string, input: { chemicalName: string; quantity: number; unit: string; notes?: string } & GpsCoords) =>
    apiFetch<JobChemicalUsage>(`/jobs/${jobId}/chemicals`, { method: 'POST', body: JSON.stringify(input) }),
  removeChemical: (jobId: string, usageId: string, gps: GpsCoords) =>
    apiFetch<{ success: boolean }>(`/jobs/${jobId}/chemicals/${usageId}`, { method: 'DELETE', body: JSON.stringify(gps) }),

  // Equipment
  listEquipment: (jobId: string) => apiFetch<JobEquipmentUsage[]>(`/jobs/${jobId}/equipment`),
  addEquipment: (jobId: string, input: { equipmentName: string; notes?: string } & GpsCoords) =>
    apiFetch<JobEquipmentUsage>(`/jobs/${jobId}/equipment`, { method: 'POST', body: JSON.stringify(input) }),
  removeEquipment: (jobId: string, usageId: string, gps: GpsCoords) =>
    apiFetch<{ success: boolean }>(`/jobs/${jobId}/equipment/${usageId}`, { method: 'DELETE', body: JSON.stringify(gps) }),

  // Audit trail
  listAuditLog: (jobId: string) => apiFetch<JobAuditLogEntry[]>(`/jobs/${jobId}/audit-log`),
};

export const JOB_STATUS_LABELS: Record<string, string> = {
  // Same underlying 'draft' status as always — jobs are only ever
  // created from an accepted estimate, so this state has always meant
  // "exists, not yet scheduled." Relabeled to say that plainly rather
  // than changing the database value, which would need a migration and
  // touch every existing job row for zero real behavioral change.
  draft: 'Needs Scheduling',
  scheduled: 'Scheduled',
  in_progress: 'In Progress',
  paused: 'Paused',
  completed: 'Completed',
  cancelled: 'Cancelled',
  on_hold: 'On Hold',
};

export const PHOTO_TYPE_LABELS: Record<string, string> = {
  before: 'Before',
  during: 'During',
  after: 'After',
  damage: 'Damage',
  equipment: 'Equipment',
  other: 'Other',
};

export const SIGNATURE_UNAVAILABLE_LABELS: Record<'customer_not_home' | 'commercial_property' | 'signature_declined', string> = {
  customer_not_home: 'Customer Not Home',
  commercial_property: 'Commercial Property',
  signature_declined: 'Signature Declined',
};

export const RECOMMENDABLE_SERVICE_LABELS: Record<string, string> = {
  roof_soft_wash: 'Roof Soft Wash',
  driveway_cleaning: 'Driveway Cleaning',
  house_wash: 'House Wash',
  pool_deck: 'Pool Deck',
  patio: 'Patio',
  fence: 'Fence',
  gutters: 'Gutters',
  screen_enclosure: 'Screen Enclosure',
  rust_removal: 'Rust Removal',
  paver_cleaning: 'Paver Cleaning',
  window_cleaning: 'Window Cleaning',
  other: 'Other',
};
