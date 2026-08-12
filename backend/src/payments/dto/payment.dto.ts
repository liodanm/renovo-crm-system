import { IsIn, IsISO8601, IsNotEmpty, IsNumber, IsOptional, IsString, Max, MaxLength, Min, ValidateIf } from 'class-validator';

const METHODS = ['card', 'ach', 'cash', 'check', 'zelle', 'other'] as const;
const CARD_TYPES = ['credit', 'debit'] as const;

export class RecordPaymentDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount!: number;

  @IsIn(METHODS)
  method!: (typeof METHODS)[number];

  // Required specifically when method is 'card' — no @IsOptional here,
  // and @ValidateIf means this rule (and the implicit "must be
  // present") only applies in that case, so a Cash/Check/Zelle/Other
  // payment is entirely unaffected. Enforced here, not just in the
  // frontend, per the explicit requirement that submitting a Card
  // payment without a card type must not be possible.
  @ValidateIf((o) => o.method === 'card')
  @IsIn(CARD_TYPES)
  cardType?: (typeof CARD_TYPES)[number];

  @IsOptional()
  @IsISO8601()
  paymentDate?: string;

  // Optional, separate from `amount` — @Min(0) (not 0.01 like amount
  // above) since a tip legitimately can be exactly $0 (the default,
  // meaning "no tip"), unlike the payment amount itself which must be
  // a genuine positive payment.
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  tipAmount?: number;

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
