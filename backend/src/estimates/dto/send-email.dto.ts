import { IsEmail, IsOptional } from 'class-validator';

export class SendEstimateEmailDto {
  // Optional override — defaults to the customer's email on file.
  // Useful the one time it's genuinely needed: sending to a different
  // recipient (a property manager, a spouse) without editing the
  // customer record itself.
  @IsOptional()
  @IsEmail()
  toEmail?: string;
}
