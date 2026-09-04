import { IsArray, IsEmail, IsIn, IsNumber, IsObject, IsOptional, IsPositive, IsString, IsUUID, Max, MaxLength, MinLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class QuoteSelectedServiceDto {
  // References an existing Service Catalog item — price and unit come
  // from there server-side, never from the client. This is the one rule
  // that makes "never trust browser calculations" actually true rather
  // than aspirational.
  @IsUUID()
  serviceCatalogItemId: string;

  // The manual measurement (customer-typed, property-intelligence
  // pre-filled, or customer-drawn via the satellite measurement tool) —
  // e.g. square footage, linear feet, or a plain count, matching
  // whatever unitOfMeasure the referenced catalog item uses.
  // @IsPositive() already rejects zero/negative; @Max() rejects an
  // implausibly large value (e.g. a fabricated "50,000 sq ft driveway")
  // without being so tight it would reject a genuinely large residential
  // or small-commercial property — this is deliberately generous, not a
  // precise per-service-type limit, since a single field here covers
  // every unit type (sq ft, linear ft, hours, count) uniformly.
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(20_000)
  quantity: number;

  // Homeowner-friendly answers (stories, roof type, staining, etc.) —
  // validated the same way EstimatesService already validates line-item
  // serviceDetails against the matching DTO in dto/service-details/, not
  // a second validation scheme.
  @IsOptional()
  @IsObject()
  serviceDetails?: Record<string, unknown>;
}

export class SubmitQuoteDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  firstName: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  lastName?: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(7)
  @MaxLength(20)
  phone: string;

  @IsString()
  @MaxLength(255)
  addressLine1: string;

  @IsString()
  @MaxLength(100)
  city: string;

  @IsString()
  @MaxLength(2)
  state: string;

  @IsString()
  @MaxLength(10)
  postalCode: string;

  // Already resolved once, earlier in the Quote Tool flow (the address
  // lookup/confirmation step) — passing them through here means the
  // property-creation step below can use them directly instead of
  // silently re-geocoding the same address a second time on every
  // submission. Optional and never required: an address that couldn't
  // be geocoded earlier still submits fine, just without coordinates
  // yet (existing, unchanged fallback behavior in
  // CustomerPropertiesService.create()).
  @IsOptional()
  @IsNumber()
  latitude?: number;

  @IsOptional()
  @IsNumber()
  longitude?: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QuoteSelectedServiceDto)
  services: QuoteSelectedServiceDto[];

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @IsOptional()
  @IsIn(['website', 'google', 'referral', 'other'])
  leadSource?: string;

  /**
   * Client-generated (e.g. a UUID created once when the widget's Step 7
   * review screen renders, reused on every retry of the same submit
   * attempt) — protects against duplicate estimates from a double-click,
   * a network retry, or a refresh-and-resubmit. Optional: a client that
   * doesn't send one simply gets no idempotency protection, not an
   * error — this widget predates any client implementation that could
   * guarantee sending it.
   */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  idempotencyKey?: string;

  /**
   * Honeypot — identical convention to CreateLeadDto's `website` field:
   * a real homeowner never sees or fills this in (hidden via CSS on the
   * actual widget), a naive bot filling every field will. Non-empty
   * means "not a human" — the service silently no-ops rather than
   * erroring, same reasoning as the existing lead-capture endpoint.
   */
  @IsOptional()
  @IsString()
  companyWebsite?: string;
}
