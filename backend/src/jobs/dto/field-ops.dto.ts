import { IsIn, IsNotEmpty, IsNumber, IsOptional, IsString, MaxLength, Min, Max } from 'class-validator';

// Browser Geolocation API accuracy is generally within ~5-6 decimal
// places of meaningful precision; 7 is kept to match the DB column
// exactly rather than silently truncating a more precise reading.
export class GpsCoordinatesDto {
  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number;

  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number;
}

export class StartJobDto extends GpsCoordinatesDto {}

const CHEMICAL_UNITS = ['oz', 'gallons', 'liters', 'ml', 'lbs', 'kg'] as const;

export class CreateChemicalUsageDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(200)
  chemicalName!: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  quantity!: number;

  @IsIn(CHEMICAL_UNITS)
  unit!: (typeof CHEMICAL_UNITS)[number];

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class UpdateChemicalUsageDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  chemicalName?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  quantity?: number;

  @IsOptional()
  @IsIn(CHEMICAL_UNITS)
  unit?: (typeof CHEMICAL_UNITS)[number];

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class CreateEquipmentUsageDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(200)
  equipmentName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

// Same service_type vocabulary as estimates/job line items — kept as a
// literal list here (rather than importing the estimates module's
// internal constant) to avoid a cross-module coupling; both lists are
// tested to stay in sync (see job-field-ops.util.spec.ts).
const SERVICE_TYPES = [
  'roof_soft_wash', 'driveway_cleaning', 'house_wash',
  'pool_deck', 'patio', 'fence', 'gutters',
  'screen_enclosure', 'rust_removal', 'paver_cleaning',
  'window_cleaning', 'other',
] as const;

const SIGNATURE_UNAVAILABLE_REASONS = ['customer_not_home', 'commercial_property', 'signature_declined'] as const;

export class CompleteJobDetailsDto extends GpsCoordinatesDto {
  @IsOptional()
  @IsString()
  customerSignatureDataUrl?: string;

  @IsOptional()
  @IsIn(SIGNATURE_UNAVAILABLE_REASONS)
  signatureUnavailableReason?: (typeof SIGNATURE_UNAVAILABLE_REASONS)[number];

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  completionNotes?: string;

  @IsOptional()
  @IsIn(SERVICE_TYPES, { each: true })
  recommendedFutureServices?: string[];

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1000)
  billableLaborHours?: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

export { SERVICE_TYPES, CHEMICAL_UNITS };
