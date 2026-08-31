import { IsString, MaxLength } from 'class-validator';

export class PropertyLookupDto {
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
}
