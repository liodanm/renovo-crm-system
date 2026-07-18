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
