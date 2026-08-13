import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class RequestMagicLinkDto {
  @IsEmail()
  email: string;
}

export class VerifyMagicLinkDto {
  // Was missing any class-validator decorator at all. The global
  // ValidationPipe (main.ts) runs with whitelist: true + forbidNonWhitelisted:
  // true — class-validator's whitelist mode only recognizes properties that
  // carry at least one decorator, so an undecorated `token` was treated as an
  // unknown/non-whitelisted field and the entire request was rejected with a
  // 400 before verifyMagicLink() ever ran, regardless of whether the token
  // itself was valid, expired, or brand new.
  @IsString()
  @IsNotEmpty()
  token: string;
}
