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

export class SendEstimateSmsDto {
  // Same override reasoning as SendEstimateEmailDto's toEmail — no
  // format validation here beyond "is a string," matching how
  // customer.phone itself is stored and how the existing automation
  // engine already sends SMS to it (see AutomationService) without any
  // E.164 normalization. Not introducing new phone validation this
  // feature doesn't need to solve.
  @IsOptional()
  @IsString()
  toPhone?: string;
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
