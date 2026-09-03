import { IsOptional, IsString, MaxLength } from 'class-validator';

export class PropertyLookupDto {
  // New — the Quote Tool's single-line address field sends this.
  // Structured fields below remain fully supported (unchanged, still
  // required together when `address` isn't sent) for any other
  // caller of this public endpoint.
  @IsOptional()
  @IsString()
  @MaxLength(255)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  addressLine1?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2)
  state?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  postalCode?: string;
}
