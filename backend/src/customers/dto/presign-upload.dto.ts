import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class PresignPhotoUploadDto {
  @IsString()
  @MaxLength(255)
  fileName: string;

  @IsString()
  mimeType: string;

  @IsOptional()
  @IsIn(['before', 'after', 'during', 'damage', 'equipment', 'other'])
  photoType?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50 * 1024 * 1024) // 50MB ceiling for a single photo/video
  fileSizeBytes?: number;
}

export class PresignDocumentUploadDto {
  @IsString()
  @MaxLength(255)
  fileName: string;

  @IsString()
  mimeType: string;

  @IsOptional()
  @IsIn(['contract', 'permit', 'id_verification', 'insurance', 'other'])
  documentType?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(25 * 1024 * 1024) // 25MB ceiling for documents
  fileSizeBytes?: number;
}
