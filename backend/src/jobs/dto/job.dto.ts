import { IsIn, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

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
