import { IsArray, IsEmail, IsOptional, IsString, IsUUID, MaxLength, MinLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class RequestedServiceDto {
  // Same reasoning as SubmitQuoteDto's QuoteSelectedServiceDto: this is
  // the only thing identifying the service — never a name/price typed
  // by the client. No quantity here — a request-only submission has no
  // price to calculate, so there's nothing to size.
  @IsUUID()
  serviceCatalogItemId: string;
}

export class RequestQuoteDto {
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

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RequestedServiceDto)
  services: RequestedServiceDto[];

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  // Same idempotency contract as SubmitQuoteDto — see that class for
  // the full reasoning, not repeated here.
  @IsOptional()
  @IsString()
  @MaxLength(100)
  idempotencyKey?: string;

  // Same honeypot convention as SubmitQuoteDto.
  @IsOptional()
  @IsString()
  companyWebsite?: string;
}
