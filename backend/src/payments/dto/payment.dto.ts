import { IsIn, IsISO8601, IsNotEmpty, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

const METHODS = ['card', 'ach', 'cash', 'check', 'zelle', 'other'] as const;

export class RecordPaymentDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount!: number;

  @IsIn(METHODS)
  method!: (typeof METHODS)[number];

  @IsOptional()
  @IsISO8601()
  paymentDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  referenceNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class RefundPaymentDto {
  // Omit for a full refund of whatever hasn't already been refunded;
  // provide for a partial refund.
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

export class VoidPaymentDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

export { METHODS };
