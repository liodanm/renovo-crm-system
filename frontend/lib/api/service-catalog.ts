import { apiFetch } from './api-client';
import type { LucideIcon } from 'lucide-react';
import { Triangle, Car, House, Umbrella, LayoutGrid, Fence, ArrowDownToLine, Grid3x3, Sparkles, AppWindow, Wrench } from 'lucide-react';

export interface CatalogChemical {
  chemicalName: string;
  mixRatio?: string;
  quantity?: number;
  unit?: string;
  notes?: string;
}

export interface CatalogEquipment {
  equipmentName: string;
  notes?: string;
}

export interface ServiceCatalogItem {
  id: string;
  name: string;
  serviceType: string;
  category: string | null;
  description: string | null;
  isActive: boolean;
  defaultUnitOfMeasure: string | null;
  defaultUnitPrice: string | null;
  minimumPrice: string | null;
  defaultLaborHours: string | null;
  estimatedDurationMinutes: number | null;
  defaultChemicals: CatalogChemical[];
  defaultEquipment: CatalogEquipment[];
  requiredEquipment: CatalogEquipment[];
  warrantyDays: number | null;
  warrantyTerms: string | null;
  preparationInstructions: string | null;
  aftercareInstructions: string | null;
  defaultNotes: string | null;
  defaultTerms: string | null;
  suggestedUpsellServiceIds: string[];
  suggestedFutureServiceIds: string[];
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export type ServiceCatalogItemInput = Omit<ServiceCatalogItem, 'id' | 'createdAt' | 'updatedAt' | 'defaultUnitPrice' | 'minimumPrice' | 'defaultLaborHours'> & {
  defaultUnitPrice?: number;
  minimumPrice?: number;
  defaultLaborHours?: number;
};

export const serviceCatalogApi = {
  list: (activeOnly = false) => apiFetch<ServiceCatalogItem[]>(`/service-catalog${activeOnly ? '?activeOnly=true' : ''}`),
  get: (id: string) => apiFetch<ServiceCatalogItem>(`/service-catalog/${id}`),
  create: (input: Partial<ServiceCatalogItemInput>) => apiFetch<ServiceCatalogItem>('/service-catalog', { method: 'POST', body: JSON.stringify(input) }),
  update: (id: string, input: Partial<ServiceCatalogItemInput>) => apiFetch<ServiceCatalogItem>(`/service-catalog/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
  archive: (id: string) => apiFetch<ServiceCatalogItem>(`/service-catalog/${id}`, { method: 'DELETE' }),
  reorder: (ids: string[]) => apiFetch<ServiceCatalogItem[]>('/service-catalog/reorder', { method: 'PATCH', body: JSON.stringify({ ids }) }),
};

export const SERVICE_TYPE_LABELS: Record<string, string> = {
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

/**
 * Auto-assigned by serviceType — not a per-item user selection. Same
 * pattern/location as SERVICE_TYPE_LABELS immediately above, so the
 * icon automatically follows the service everywhere serviceType is
 * already displayed (Service Catalog, Estimate/Job/Invoice line items)
 * with zero schema changes, since serviceType is already stored on all
 * of those. If per-item icon override is ever wanted, that's a real,
 * separate future decision requiring an actual nullable column — not
 * something to build speculatively now.
 */
export const SERVICE_TYPE_ICONS: Record<string, LucideIcon> = {
  roof_soft_wash: Triangle,
  driveway_cleaning: Car,
  house_wash: House,
  pool_deck: Umbrella,
  patio: LayoutGrid,
  fence: Fence,
  gutters: ArrowDownToLine,
  screen_enclosure: Grid3x3,
  rust_removal: Sparkles,
  paver_cleaning: LayoutGrid,
  window_cleaning: AppWindow,
  other: Wrench,
};

export const UNIT_LABELS: Record<string, string> = {
  sq_ft: 'sq ft',
  linear_ft: 'linear ft',
  each: 'each',
  hours: 'hours',
};
