import { IsBoolean, IsObject, IsOptional, IsString } from 'class-validator';

export class UpdateReceptionistSettingsDto {
  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;

  @IsOptional()
  @IsString()
  greeting?: string;

  @IsOptional()
  @IsString()
  recordingDisclosure?: string;

  @IsOptional()
  @IsString()
  transferPhoneNumber?: string;

  @IsOptional()
  @IsObject()
  businessHours?: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  voicemailEnabled?: boolean;
}
