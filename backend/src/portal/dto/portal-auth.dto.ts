import { IsEmail } from 'class-validator';

export class RequestMagicLinkDto {
  @IsEmail()
  email: string;
}

export class VerifyMagicLinkDto {
  token: string;
}
