import { IsString, MinLength, MaxLength, Matches, IsOptional } from 'class-validator';

/**
 * The only legitimate way to join an EXISTING company. `inviteToken` is
 * issued when an owner/admin invites a teammate (creates a `company_users`
 * row with status='invited' and emails a signed, single-use token).
 * If the invited email doesn't yet have an Renovo account, this endpoint
 * creates the user and sets their password in the same step; if the
 * account already exists, `password` is ignored and the user simply
 * confirms and is attached to the new company.
 */
export class InviteAcceptDto {
  @IsString()
  inviteToken: string;

  @IsOptional()
  @IsString()
  @MinLength(10)
  @MaxLength(128)
  @Matches(/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, {
    message: 'Password must contain at least one uppercase letter, one lowercase letter, and one number',
  })
  password?: string;
}
