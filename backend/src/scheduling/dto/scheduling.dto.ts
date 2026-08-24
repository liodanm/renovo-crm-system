import { IsIn, IsISO8601, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

export class ScheduleJobDto {
  @IsISO8601()
  startsAt!: string;

  @IsISO8601()
  endsAt!: string;

  // Genuinely optional — omitting this means "use the company default,
  // or the hardcoded fallback if the company hasn't set one either."
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1440)
  arrivalWindowMinutes?: number;

  @IsOptional()
  @IsUUID()
  assignedUserId?: string;
}

export class RescheduleAppointmentDto {
  @IsISO8601()
  startsAt!: string;

  @IsISO8601()
  endsAt!: string;
}

export class UpdateAppointmentAssignmentDto {
  @IsOptional()
  @IsUUID()
  assignedUserId?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1440)
  arrivalWindowMinutes?: number;
}

export class CancelAppointmentDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}

export class QueryCalendarDto {
  @IsISO8601()
  start!: string;

  @IsISO8601()
  end!: string;

  @IsOptional()
  @IsIn(['scheduled', 'confirmed', 'completed', 'cancelled', 'no_show'])
  status?: string;

  @IsOptional()
  @IsUUID()
  assignedUserId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;
}

const CALENDAR_ITEM_TYPES = ['job', 'estimate_visit', 'consultation', 'follow_up', 'customer_meeting', 'property_inspection', 'job_check', 'pickup_delivery', 'other'];

export class CreateCalendarItemDto {
  @IsString()
  @MaxLength(200)
  title!: string;

  @IsIn(CALENDAR_ITEM_TYPES)
  appointmentType!: string;

  @IsISO8601()
  startsAt!: string;

  @IsISO8601()
  endsAt!: string;

  // All three deliberately optional — a general Calendar Item can exist
  // with none of them (see the appointments table's own long-standing
  // nullable customer_id/property_id/job_id, unchanged by this feature).
  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsOptional()
  @IsUUID()
  propertyId?: string;

  @IsOptional()
  @IsUUID()
  jobId?: string;

  @IsOptional()
  @IsUUID()
  assignedUserId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  location?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class UpdateCalendarItemDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsIn(CALENDAR_ITEM_TYPES)
  appointmentType?: string;

  @IsOptional()
  @IsISO8601()
  startsAt?: string;

  @IsOptional()
  @IsISO8601()
  endsAt?: string;

  // Explicit null (not just omission) is how the frontend clears an
  // already-set relationship — e.g. "this was linked to a customer,
  // now it shouldn't be." Omitting the field entirely means "leave it
  // as-is," matching how every other optional field here behaves.
  // @IsOptional() short-circuits validation for null/undefined but
  // still runs @IsUUID() for any actual non-null value provided.
  @IsOptional()
  @IsUUID()
  customerId?: string | null;

  @IsOptional()
  @IsUUID()
  propertyId?: string | null;

  @IsOptional()
  @IsUUID()
  jobId?: string | null;

  @IsOptional()
  @IsUUID()
  assignedUserId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  location?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string | null;
}
