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

  // "When was the payment received?" — kept completely separate from
  // serviceDate below. For a normal current job these are usually the
  // same date; for historical/manually-entered data they can differ,
  // which is the entire reason this field exists.
  @IsOptional()
  @IsISO8601()
  paymentDate?: string;

  // "When was the service actually performed?" — NOT interchangeable
  // with paymentDate. Optional so a normal current-job payment doesn't
  // force the user to fill it in (the frontend defaults it sensibly —
  // see the Record Payment form), but once persisted it's the field
  // Customer.lastServiceDate is computed from for this payment, not
  // paymentDate. Never silently defaulted to paymentDate on the
  // backend — that would recreate the exact bug this field exists to
  // fix (a same-day payment on old work looking like a new service).
  @IsOptional()
  @IsISO8601()
  serviceDate?: string;

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
