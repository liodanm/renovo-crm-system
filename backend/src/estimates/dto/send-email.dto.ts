import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';

export class SendEstimateEmailDto {
  // Optional override — defaults to the customer's email on file.
  // Useful the one time it's genuinely needed: sending to a different
  // recipient (a property manager, a spouse) without editing the
  // customer record itself.
  @IsOptional()
  @IsEmail()
  toEmail?: string;
}

export class DeclineEstimateDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  declineReason?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  declineComments?: string;
}
