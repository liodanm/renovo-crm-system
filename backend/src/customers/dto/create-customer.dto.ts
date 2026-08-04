import { IsEmail, IsIn, IsOptional, IsString, MaxLength, IsArray, ValidateNested, IsBoolean } from 'class-validator';
import { Type } from 'class-transformer';

// One list, reused by this DTO's own @IsIn validator below AND by
// customer-import-export.service.ts's CSV import validation — found
// during the Feature 3 audit as two independently-hardcoded copies of
// the same 4 values, closed here rather than left as a real (if minor)
// duplicate-source-of-truth risk.
export const LEAD_STATUS_VALUES = ['lead', 'active', 'inactive', 'archived', 'churned'] as const;

export class CreatePropertyInputDto {
  @IsOptional()
  @IsString()
  label?: string;

  @IsString()
  @MaxLength(255)
  addressLine1: string;

  @IsOptional()
  @IsString()
  addressLine2?: string;

  @IsString()
  city: string;

  @IsString()
  state: string;

  @IsString()
  postalCode: string;

  @IsOptional()
  latitude?: number;

  @IsOptional()
  longitude?: number;
}

export class CreateCustomerDto {
  @IsIn(['residential', 'commercial'])
  customerType: 'residential' | 'commercial';

  @IsOptional()
  @IsString()
  @MaxLength(100)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  lastName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  businessName?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  secondaryPhone?: string;

  @IsOptional()
  @IsString()
  source?: string;

  @IsOptional()
  @IsIn(LEAD_STATUS_VALUES)
  leadStatus?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsString()
  notesText?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreatePropertyInputDto)
  properties?: CreatePropertyInputDto[];

  /**
   * When the caller already saw the duplicate-check warning and wants to
   * proceed anyway (e.g. two locations of the same franchise, legitimately
   * sharing a phone number), setting this skips re-blocking on the same
   * signal. Duplicate detection is advisory, never a hard block — see
   * DuplicateDetectionService.
   */
  @IsOptional()
  @IsBoolean()
  acknowledgedDuplicateWarning?: boolean;
}
