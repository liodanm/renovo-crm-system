import { IsEmail, IsOptional } from 'class-validator';

export class SendInvoiceEmailDto {
  @IsOptional()
  @IsEmail()
  toEmail?: string;
}
