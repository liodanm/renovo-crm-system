import { IsIn, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

export class UpdateJobDto {
  @IsOptional()
  @IsString()
  @MaxLength(300)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  notes?: string; // customer-facing

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  internalNotes?: string; // staff-only

  // Scheduling (scheduledStart/scheduledEnd) is deliberately NOT here —
  // it now belongs exclusively to POST /scheduling/jobs/:jobId, per the
  // approved architecture where appointments is the single source of
  // truth. This used to be handled directly here; removed rather than
  // left as a second, competing write path into the same two columns.

  // Live today; assignedCrewId intentionally not exposed yet — see
  // migration 013's comment on why the two coexist without either being
  // required.
  @IsOptional()
  @IsUUID()
  assignedUserId?: string;

  @IsOptional()
  @IsIn(['normal', 'follow_up', 'high', 'emergency'])
  priority?: string;
}

export class PauseJobDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

export class CancelJobDto {
  // Required, not optional — the approved spec says the modal
  // "requires" a reason. cancellation_reason itself stays the existing
  // free-text column (confirmed already present, no schema change);
  // the suggested options (Customer Cancelled, Weather, etc.) are a
  // frontend-only convenience, not a new enum here.
  @IsNotEmpty()
  @IsString()
  @MaxLength(500)
  cancellationReason!: string;
}

export class QueryJobsDto {
  @IsOptional()
  @IsIn(['draft', 'scheduled', 'in_progress', 'paused', 'completed', 'cancelled', 'on_hold'])
  status?: string;

  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsOptional()
  @IsIn(['normal', 'follow_up', 'high', 'emergency'])
  priority?: string;
}

const CALLBACK_REASONS = ['callback', 're_clean', 'warranty', 'complaint', 'customer_requested_return', 'internal_qc_return'] as const;
const CALLBACK_STATUSES = ['open', 'resolved', 'cancelled'] as const;

/**
 * customerId is deliberately NOT on this DTO — always derived server-side
 * from the original job's own customer, never trusted from the client,
 * same reasoning as every other "don't let the client assert a
 * relationship the server can already prove" boundary in this app.
 */
export class CreateJobCallbackDto {
  @IsIn(CALLBACK_REASONS)
  reason!: (typeof CALLBACK_REASONS)[number];

  @IsOptional()
  @IsUUID()
  newJobId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class UpdateJobCallbackDto {
  @IsOptional()
  @IsIn(CALLBACK_STATUSES)
  status?: (typeof CALLBACK_STATUSES)[number];

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  resolution?: string;

  @IsOptional()
  @IsUUID()
  newJobId?: string | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  additionalLaborCost?: number | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  additionalMaterialCost?: number | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  refundAmount?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

/**
 * Deliberately every field optional and independently nullable-settable
 * — a tech or office staff member records whichever cost categories are
 * actually known at the time (e.g. labor hours right after completion,
 * chemical cost once an invoice from the supplier arrives days later),
 * not all five at once. Sending an explicit `null` clears a
 * previously-recorded value back to "not known" (distinct from omitting
 * the field, which leaves the existing stored value untouched) — same
 * PATCH semantics UpdateJobDto already uses elsewhere in this file.
 */
export class UpdateJobLineItemActualCostsDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  actualLaborHours?: number | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  actualChemicalCost?: number | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  actualEquipmentCost?: number | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  actualFuelCost?: number | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  actualMiscCost?: number | null;

  @IsOptional()
  @IsUUID()
  assignedUserId?: string | null;
}
