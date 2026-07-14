import { IsEmail, IsString, MinLength, MaxLength, Matches, IsOptional } from 'class-validator';

/**
 * Registration always creates a brand-new company with the registering
 * user as its `owner`. Joining an existing company happens exclusively
 * via an invite (see InviteAcceptDto), never via open self-registration —
 * this prevents strangers from registering their way into someone else's
 * tenant.
 */
export class RegisterDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(10)
  @MaxLength(128)
  @Matches(/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, {
    message: 'Password must contain at least one uppercase letter, one lowercase letter, and one number',
  })
  password: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  firstName: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  lastName: string;

  @IsString()
  @MinLength(2)
  @MaxLength(150)
  companyName: string;

  @IsOptional()
  @IsString()
  phone?: string;
}
