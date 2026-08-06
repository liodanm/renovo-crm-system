import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsDateString, IsIn, IsNumber, IsOptional, IsString, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { CreateEstimateLineItemDto } from './create-estimate.dto';

export class UpdateEstimateDto {
  // Replaces the full line-item set when provided — matches how the
  // artifact prototype's estimate builder always worked (edit the whole
  // list, not patch one row at a time), and avoids ambiguous partial-item
  // update semantics (what does "update item 3" mean if the array's order
  // changed?).
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1, { message: 'An estimate needs at least one line item' })
  @ValidateNested({ each: true })
  @Type(() => CreateEstimateLineItemDto)
  lineItems?: CreateEstimateLineItemDto[];

  @IsOptional()
  @IsIn(['fixed', 'percentage'])
  discountType?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  discountValue?: number;

  @IsOptional()
  @IsIn(['package', 'manual'])
  discountSource?: string;

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

  // See CreateEstimateDto — same field, same downstream consumers.
  @IsOptional()
  @IsDateString()
  validUntil?: string;
}
