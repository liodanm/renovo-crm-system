import { IsBoolean, IsInt, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateFaqEntryDto {
  @IsString()
  @MinLength(3)
  question: string;

  @IsString()
  @MinLength(3)
  answer: string;

  @IsOptional()
  @IsInt()
  sortOrder?: number;
}

export class UpdateFaqEntryDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  question?: string;

  @IsOptional()
  @IsString()
  @MinLength(3)
  answer?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsInt()
  sortOrder?: number;
}
