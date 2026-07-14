import { IsArray, IsOptional, IsString, MinLength } from 'class-validator';

export class PortalChatDto {
  @IsString()
  @MinLength(1)
  message: string;

  @IsOptional()
  @IsArray()
  history?: Array<{ role: string; content: any }>;
}
