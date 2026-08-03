import { PartialType } from '@nestjs/mapped-types';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

const SERVICE_TYPES = [
  'roof_soft_wash', 'driveway_cleaning', 'house_wash',
  'pool_deck', 'patio', 'fence', 'gutters',
  'screen_enclosure', 'rust_removal', 'paver_cleaning',
  'window_cleaning', 'other',
] as const;

const UNITS_OF_MEASURE = ['sq_ft', 'linear_ft', 'each', 'hours'] as const;

export class CatalogChemicalDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(200)
  chemicalName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  mixRatio?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  quantity?: number;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  unit?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class CatalogEquipmentDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(200)
  equipmentName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class CreateServiceCatalogItemDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(200)
  name!: string;

  @IsIn(SERVICE_TYPES)
  serviceType!: (typeof SERVICE_TYPES)[number];

  @IsOptional()
  @IsString()
  @MaxLength(100)
  category?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsIn(UNITS_OF_MEASURE)
  defaultUnitOfMeasure?: (typeof UNITS_OF_MEASURE)[number];

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  defaultUnitPrice?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  minimumPrice?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1000)
  defaultLaborHours?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1440)
  estimatedDurationMinutes?: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => CatalogChemicalDto)
  defaultChemicals?: CatalogChemicalDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => CatalogEquipmentDto)
  defaultEquipment?: CatalogEquipmentDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => CatalogEquipmentDto)
  requiredEquipment?: CatalogEquipmentDto[];

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(3650)
  warrantyDays?: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  warrantyTerms?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  preparationInstructions?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  aftercareInstructions?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  defaultNotes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  defaultTerms?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsUUID(undefined, { each: true })
  suggestedUpsellServiceIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsUUID(undefined, { each: true })
  suggestedFutureServiceIds?: string[];
}

// Every field optional for updates — a partial edit shouldn't require
// resubmitting the whole record. PartialType (same pattern already used
// by update-customer.dto.ts) is the correct tool here, not `declare`
// overrides — TS's structural typing rejects widening a required field
// to optional via inheritance, even with `declare`.
export class UpdateServiceCatalogItemDto extends PartialType(CreateServiceCatalogItemDto) {}

export class ReorderServiceCatalogDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID(undefined, { each: true })
  ids: string[];
}

export { SERVICE_TYPES, UNITS_OF_MEASURE };
