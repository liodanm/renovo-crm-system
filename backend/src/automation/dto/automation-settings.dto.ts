import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator';

export class UpdateAutomationSettingsDto {
  @IsOptional()
  @IsBoolean()
  estimateFollowupEnabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(30)
  estimateFollowupAfterDays?: number;

  @IsOptional()
  @IsBoolean()
  recurringReminderEnabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(36)
  recurringReminderIntervalMonths?: number;

  @IsOptional()
  @IsBoolean()
  reviewRequestEnabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(30)
  reviewRequestDelayDays?: number;
}
