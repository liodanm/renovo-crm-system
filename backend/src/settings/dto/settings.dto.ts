import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsNotEmpty, IsNumber, IsObject, IsOptional, IsString, Matches, MaxLength, Min, ValidateNested } from 'class-validator';

// ---- Profile ----

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  lastName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @IsOptional()
  @IsString()
  avatarUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  timezone?: string;

  @IsOptional()
  @IsIn(['MM/DD/YYYY', 'DD/MM/YYYY', 'YYYY-MM-DD'])
  dateFormat?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  language?: string;
}

export class ChangePasswordDto {
  @IsNotEmpty()
  @IsString()
  currentPassword!: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(200)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/, {
    message: 'New password must be at least 8 characters and include upper, lower, and a number',
  })
  newPassword!: string;
}

// ---- Company ----

class BusinessHoursDayDto {
  @IsOptional()
  @IsString()
  open?: string;

  @IsOptional()
  @IsString()
  close?: string;

  @IsOptional()
  @IsBoolean()
  closed?: boolean;
}

export class UpdateCompanyDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  dba?: string;

  @IsOptional()
  @IsString()
  logoUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  addressLine1?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  addressLine2?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  state?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  postalCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  website?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  taxId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  licenseNumber?: string;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => Object)
  businessHours?: Record<string, { open?: string; close?: string; closed?: boolean }>;
}

// ---- Business Defaults ----

export class UpdateBusinessDefaultsDto {
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  defaultTaxRatePercent?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  defaultArrivalWindowMinutes?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  defaultEstimateExpirationDays?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  defaultInvoiceDueDays?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  defaultLaborRate?: number;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  currency?: string;

  @IsOptional()
  @IsIn(['imperial', 'metric'])
  measurementUnitSystem?: string;

  @IsOptional()
  @IsIn(['miles', 'km'])
  distanceUnit?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  timezone?: string;
}

// ---- Branding (stored inside companies.settings JSONB) ----

export class UpdateBrandingDto {
  @IsOptional()
  @IsString()
  logoUrl?: string;

  @IsOptional()
  @Matches(/^#[0-9a-fA-F]{6}$/, { message: 'primaryColor must be a hex color like #0e7490' })
  primaryColor?: string;

  @IsOptional()
  @Matches(/^#[0-9a-fA-F]{6}$/, { message: 'secondaryColor must be a hex color like #0e7490' })
  secondaryColor?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  estimateHeader?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  invoiceHeader?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  footerMessage?: string;
}
