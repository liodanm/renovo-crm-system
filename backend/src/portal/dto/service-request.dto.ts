import { IsBoolean, IsIn, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateServiceRequestDto {
  @IsOptional()
  @IsString()
  propertyId?: string;

  @IsString()
  @MinLength(5)
  description: string;

  @IsOptional()
  @IsString()
  requestedServiceType?: string;

  @IsOptional()
  @IsBoolean()
  isRecurring?: boolean;

  @IsOptional()
  @IsIn(['weekly', 'biweekly', 'monthly'])
  recurringFrequency?: string;

  @IsOptional()
  @IsString()
  preferredDates?: string;
}
