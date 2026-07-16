import { IsIn, IsOptional, IsUUID } from 'class-validator';

export class QueryEstimatesDto {
  @IsOptional()
  @IsIn(['draft', 'sent', 'viewed', 'accepted', 'declined', 'expired'])
  status?: string;

  @IsOptional()
  @IsUUID()
  customerId?: string;
}
