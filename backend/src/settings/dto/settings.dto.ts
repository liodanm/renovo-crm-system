import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsEmail, IsIn, IsNotEmpty, IsNumber, IsObject, IsOptional, IsString, Matches, Max, MaxLength, Min, ValidateNested } from 'class-validator';

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

// Each weekday declared explicitly (rather than a generic Record<string, ...>)
// so the global ValidationPipe's forbidNonWhitelisted check actually
// recognizes these keys instead of stripping/rejecting all of them —
// a Record<string, ...> shape has no real class properties for
// class-validator's whitelist to match against.
class BusinessHoursDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => BusinessHoursDayDto)
  monday?: BusinessHoursDayDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => BusinessHoursDayDto)
  tuesday?: BusinessHoursDayDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => BusinessHoursDayDto)
  wednesday?: BusinessHoursDayDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => BusinessHoursDayDto)
  thursday?: BusinessHoursDayDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => BusinessHoursDayDto)
  friday?: BusinessHoursDayDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => BusinessHoursDayDto)
  saturday?: BusinessHoursDayDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => BusinessHoursDayDto)
  sunday?: BusinessHoursDayDto;
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
  @Type(() => BusinessHoursDto)
  businessHours?: BusinessHoursDto;
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

// ---- Payment Settings ----
// Stripe's own secret key/webhook secret are never here — they're
// environment variables, checked read-only via IntegrationStatusService.
// Only genuinely safe-to-store preferences live in the database.

const PAYMENT_METHODS = ['card', 'ach', 'cash', 'check', 'zelle', 'other'] as const;

export class UpdatePaymentSettingsDto {
  @IsOptional()
  @IsArray()
  @IsIn(PAYMENT_METHODS, { each: true })
  enabledPaymentMethods?: string[];

  @IsOptional()
  @IsBoolean()
  processingFeeEnabled?: boolean;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  processingFeePercent?: number;
}

// ---- Email Settings ----
// POSTMARK_SERVER_TOKEN/MAIL_FROM_ADDRESS are environment variables,
// same reasoning as Stripe above. replyToEmail is the one genuinely new,
// safe field — an address separate from the company's main contact
// email that a customer's reply should land in instead.

export class UpdateEmailSettingsDto {
  @IsOptional()
  @IsEmail()
  replyToEmail?: string;
}

export class SendTestEmailDto {
  @IsNotEmpty()
  @IsEmail()
  toEmail!: string;
}

// ---- Business Links (stored inside companies.settings JSONB, under `integrations`) ----
// Not credentials — these are public URLs a customer-facing page/automation
// message links out to. Real secrets (Stripe/Postmark/Twilio/S3/Anthropic)
// are never stored here or anywhere else in the database; see
// IntegrationsService for why.

export class UpdateBusinessLinksDto {
  @IsOptional()
  @Matches(/^(https?:\/\/.+)?$/, { message: 'googleReviewUrl must be a valid http(s) URL' })
  @MaxLength(500)
  googleReviewUrl?: string;

  @IsOptional()
  @Matches(/^(https?:\/\/.+)?$/, { message: 'website must be a valid http(s) URL' })
  @MaxLength(500)
  website?: string;

  @IsOptional()
  @Matches(/^(https?:\/\/.+)?$/, { message: 'facebook must be a valid http(s) URL' })
  @MaxLength(500)
  facebook?: string;

  @IsOptional()
  @Matches(/^(https?:\/\/.+)?$/, { message: 'instagram must be a valid http(s) URL' })
  @MaxLength(500)
  instagram?: string;
}

// ---- Google Reviews (also stored inside companies.settings.integrations —
// same JSONB key as Business Links above, merged not overwritten. Kept as
// its own DTO/endpoint pair rather than folded into UpdateBusinessLinksDto
// because it's conceptually a different thing: a live Places API
// integration with its own enable/disable state, not a static outbound
// URL. A Google Place ID is a public identifier, not a credential — see
// ADR-011 for why real secrets (the API key itself) never live here;
// that stays a Railway env var (GOOGLE_PLACES_API_KEY), same as every
// other provider. ----

export class UpdateGoogleReviewsConfigDto {
  @IsOptional()
  @IsString()
  @MaxLength(300)
  googlePlaceId?: string;

  @IsOptional()
  @IsBoolean()
  googleReviewsEnabled?: boolean;
}

// ---- SMS Settings ----

export class SendTestSmsDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(20)
  toPhone!: string;
}

export class LeadSourceOptionDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(50)
  key!: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(50)
  label!: string;

  @IsBoolean()
  enabled!: boolean;
}

export class UpdateLeadSourcesDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LeadSourceOptionDto)
  options!: LeadSourceOptionDto[];
}

/**
 * Upsert semantics on (companyId, chemicalName, unit) — the same
 * unique key migration 041 gives the table — so setting a rate for a
 * chemical/unit that already has one simply updates it, rather than
 * needing a separate create-vs-update distinction the frontend would
 * have to track. chemicalName/unit here identify WHICH rate; costPerUnit
 * is the only field ever actually changing on a re-submit.
 */
export class UpsertChemicalCostRateDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(200)
  chemicalName!: string;

  @IsNotEmpty()
  @IsString()
  unit!: string;

  @IsNumber()
  @Min(0)
  costPerUnit!: number;
}

const ALLOWED_LOGO_MIME_TYPES = ['image/png', 'image/jpeg'];
const MAX_LOGO_FILE_SIZE_BYTES = 2 * 1024 * 1024; // 2MB — no existing established limit found elsewhere in this codebase for image uploads, so using the requested default.

export class PresignLogoUploadDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(255)
  fileName: string;

  @IsNotEmpty()
  @IsString()
  @IsIn(ALLOWED_LOGO_MIME_TYPES, { message: 'Logo must be a PNG or JPEG image' })
  mimeType: string;

  @IsOptional()
  @IsNumber()
  @Max(MAX_LOGO_FILE_SIZE_BYTES, { message: 'Logo file must be 2MB or smaller' })
  fileSizeBytes?: number;
}

export class PackageDiscountTierDto {
  @IsNumber()
  @Min(2)
  minServices!: number;

  @IsNumber()
  @Min(0)
  percent!: number;
}

export class UpdatePackageDiscountsDto {
  @IsBoolean()
  enabled!: boolean;

  @IsIn(['tiered', 'fixed'])
  mode!: 'tiered' | 'fixed';

  @IsOptional()
  @IsNumber()
  @Min(0)
  fixedPercent?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PackageDiscountTierDto)
  tiers?: PackageDiscountTierDto[];
}

export class UpdateEstimateSettingsDto {
  @IsBoolean()
  enableTax!: boolean;

  @IsBoolean()
  enableExpiration!: boolean;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(365)
  defaultValidUntilDays?: number;
}

export class UpdateConsentDisclosuresDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  sms?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  marketingSms?: string;
}
