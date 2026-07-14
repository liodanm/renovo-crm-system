import { IsString, MinLength } from 'class-validator';

export class ApproveEstimateDto {
  @IsString()
  @MinLength(100) // a real signature data URL is always much longer than this; catches an empty/placeholder submission
  signatureDataUrl: string;
}
