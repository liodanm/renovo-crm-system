import { IsIn, IsISO8601, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class UpdateInvoiceDto {
  @IsOptional()
  @IsISO8601()
  dueDate?: string;

  @IsOptional()
  @IsIn(['fixed', 'percentage'])
  discountType?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  discountValue?: number;

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
  terms?: string;
}

export class QueryInvoicesDto {
  @IsOptional()
  @IsIn(['draft', 'sent', 'partial', 'paid', 'overdue', 'void'])
  status?: string;

  @IsOptional()
  @IsString()
  customerId?: string;
}
