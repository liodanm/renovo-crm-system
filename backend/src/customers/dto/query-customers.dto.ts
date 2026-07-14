import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class QueryCustomersDto {
  @IsOptional()
  @IsString()
  search?: string; // matches name/business name/email/phone

  @IsOptional()
  @IsIn(['residential', 'commercial'])
  customerType?: string;

  @IsOptional()
  @IsIn(['lead', 'active', 'inactive', 'churned'])
  leadStatus?: string;

  @IsOptional()
  @IsString()
  tags?: string; // comma-separated; customers matching ANY of these tags

  @IsOptional()
  @IsString()
  createdAfter?: string;

  @IsOptional()
  @IsString()
  createdBefore?: string;

  @IsOptional()
  @IsIn(['name', 'createdAt', 'updatedAt', 'lifetimeValue'])
  sortBy?: string;

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortDir?: 'asc' | 'desc';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}
