import { ArrayMaxSize, ArrayMinSize, IsArray, IsUUID } from 'class-validator';

export class BulkDeleteCustomersDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200) // matches the page size ceiling elsewhere in this module — a bulk action never needs more than what one screen can show
  @IsUUID('4', { each: true })
  ids: string[];
}
