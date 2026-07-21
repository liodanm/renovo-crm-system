import { IsBoolean, IsInt, IsObject, IsOptional, Max, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class TemplateOverrideDto {
  @IsOptional()
  subject?: string;

  @IsOptional()
  body?: string;
}

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

  @IsOptional()
  @IsBoolean()
  paymentReminderEnabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(60)
  paymentReminderDaysAfterDue?: number;

  @IsOptional()
  @IsBoolean()
  estimateExpirationReminderEnabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(14)
  estimateExpirationReminderDaysBefore?: number;

  @IsOptional()
  @IsBoolean()
  jobThankYouEnabled?: boolean;

  // Keys are rule types (estimate_followup, recurring_reminder, etc.) —
  // validated loosely here since it's a sparse override map, not a fixed
  // shape; each rule method only ever reads subject/body off whatever key
  // matches its own ruleType, so an unrecognized key is simply unused,
  // never an error.
  @IsOptional()
  @IsObject()
  templates?: Record<string, { subject?: string; body?: string }>;
}
