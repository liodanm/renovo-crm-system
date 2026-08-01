import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Max,
  Min,
  MaxLength,
  ValidateNested,
  IsDateString,
} from 'class-validator';

const SERVICE_TYPES = [
  'roof_soft_wash', 'driveway_cleaning', 'house_wash', 'pool_deck', 'patio',
  'fence', 'gutters', 'screen_enclosure', 'rust_removal', 'paver_cleaning',
  'window_cleaning', 'other',
] as const;

const UNITS_OF_MEASURE = ['sq_ft', 'linear_ft', 'each', 'hours'] as const;

export class CreateEstimateLineItemDto {
  @IsIn(SERVICE_TYPES)
  serviceType: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  description: string;

  @IsIn(UNITS_OF_MEASURE)
  unitOfMeasure: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  quantity: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  unitPrice: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  // Shape depends on serviceType — validated separately in
  // EstimatesService against the matching DTO in dto/service-details/,
  // not by a decorator here (there's no clean way to express "validate
  // against a DTO chosen by a sibling field's value" declaratively).
  @IsOptional()
  @IsObject()
  serviceDetails?: Record<string, unknown>;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  estimatedLaborHours?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  estimatedChemicalCost?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  estimatedEquipmentCost?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  estimatedFuelCost?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  estimatedMiscCost?: number;

  // Future-ready, unused today — see migration 010's comment. Accepted
  // here so the DTO doesn't need another change the day this actually
  // gets used, but nothing in the current UI sets it.
  @IsOptional()
  @IsUUID()
  assignedUserId?: string;

  // Set when this line item was created by picking a Service Catalog
  // entry — additive per the approved architecture. Never required:
  // a line item built entirely by hand has no catalog origin, and
  // that's a completely valid, common case.
  @IsOptional()
  @IsUUID()
  serviceCatalogItemId?: string;
}

export class CreateEstimateDto {
  @IsUUID()
  customerId: string;

  @IsUUID()
  propertyId: string;

  // Additive, Quote Widget only — 'Website Instant Quote' when set;
  // every existing staff-facing caller simply never sends this and it
  // stays null, exactly as before this field existed.
  @IsOptional()
  @IsString()
  @MaxLength(100)
  source?: string;

  @IsArray()
  @ArrayMinSize(1, { message: 'An estimate needs at least one line item' })
  @ValidateNested({ each: true })
  @Type(() => CreateEstimateLineItemDto)
  lineItems: CreateEstimateLineItemDto[];

  @IsOptional()
  @IsIn(['fixed', 'percentage'])
  discountType?: string;

  // Meaning depends on discountType: a dollar amount if 'fixed', a
  // percentage number (e.g. 10 for 10%) if 'percentage' — validated
  // together with discountType in the service, since class-validator
  // can't easily express "required if discountType is set" here cleanly
  // alongside the percentage-range check below.
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  discountValue?: number;

  // A percentage (e.g. 8.25 for 8.25%), not the stored fraction —
  // converted to the DB's fraction convention (tax_rate NUMERIC(5,4)) in
  // the service layer, so the API stays in the units a person actually
  // thinks in.
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  taxRatePercent?: number;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  notes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  internalNotes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  terms?: string;

  // ISO date string (YYYY-MM-DD). Read by AutomationService's expiration
  // reminder/auto-expire rules (see runEstimateExpirationReminders /
  // runEstimateExpiration) and rendered on the PDF, the send-email
  // template, and the customer portal — all of which already expected
  // this to be settable. Optional: an estimate with no valid-until date
  // simply never enters either automation rule, same as before this field
  // was exposed here.
  @IsOptional()
  @IsDateString()
  validUntil?: string;
}
