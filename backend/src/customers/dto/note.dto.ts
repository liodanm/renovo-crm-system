import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateNoteDto {
  @IsString()
  @MinLength(1)
  body: string;

  @IsOptional()
  @IsBoolean()
  isPinned?: boolean;
}

export class UpdateNoteDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  body?: string;

  @IsOptional()
  @IsBoolean()
  isPinned?: boolean;
}
