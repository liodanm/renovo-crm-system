import { IsBoolean, IsIn, IsInt, IsOptional, IsPositive, Max, Min } from 'class-validator';

/**
 * One DTO class per service type that has real, known-today details worth
 * capturing — the three from the original request (roof, driveway, house
 * wash). Every other service type (pool_deck, patio, fence, gutters,
 * screen_enclosure, rust_removal, paver_cleaning, window_cleaning, other)
 * has no dedicated shape yet — service_details stays null for those until
 * someone has a real, specific field list for them, same "don't invent
 * fields nobody asked for" principle as everything else in this project.
 * Adding a new one later means adding a new class here and one line in
 * the switch in validateServiceDetails() — not a migration, since the
 * column is already JSONB.
 */

export class RoofSoftWashDetailsDto {
  @IsPositive()
  roofSquareFootage: number;

  @IsIn(['tile', 'shingle', 'metal'])
  roofType: string;

  @IsInt()
  @Min(1)
  @Max(10)
  stories: number;

  @IsOptional()
  @IsIn(['low', 'medium', 'steep'])
  pitch?: string;

  @IsOptional()
  chemicalMixUsed?: string;
}

export class DrivewayCleaningDetailsDto {
  @IsPositive()
  squareFootage: number;

  @IsIn(['concrete', 'pavers'])
  surfaceMaterial: string;

  @IsOptional()
  @IsBoolean()
  hasOilStains?: boolean;

  @IsOptional()
  @IsBoolean()
  hasRustStains?: boolean;
}

export class HouseWashDetailsDto {
  @IsInt()
  @Min(1)
  @Max(10)
  stories: number;

  @IsIn(['vinyl', 'brick', 'stucco', 'wood', 'fiber_cement', 'other'])
  exteriorMaterial: string;

  @IsOptional()
  @IsBoolean()
  oxidationPresent?: boolean;
}
