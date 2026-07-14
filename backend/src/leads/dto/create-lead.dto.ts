import { IsEmail, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateLeadDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  firstName: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  lastName?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsString()
  @MinLength(7)
  @MaxLength(20)
  phone: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
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

  @IsOptional()
  @IsString()
  @MaxLength(500)
  serviceInterest?: string;

  @IsOptional()
  @IsIn(['website', 'google', 'referral', 'other'])
  source?: string;

  /**
   * Honeypot — a field real customers never see or fill in (hidden via CSS
   * on the actual form), but a naive scraping bot filling every input on
   * the page will populate. Any non-empty value here means "not a human,"
   * silently drop the submission rather than erroring (an error response
   * just teaches the bot which field to leave blank).
   */
  @IsOptional()
  @IsString()
  website?: string;
}
