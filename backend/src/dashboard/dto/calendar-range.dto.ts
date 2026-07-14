import { IsDateString, IsOptional } from 'class-validator';

export class CalendarRangeQueryDto {
  @IsOptional()
  @IsDateString()
  start?: string;

  @IsOptional()
  @IsDateString()
  end?: string;
}
