import { IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateCustomFieldDefinitionDto {
  @IsIn(['customer', 'property', 'job'])
  entityType: string;

  @IsString()
  @MaxLength(50)
  fieldKey: string; // e.g. 'gate_code' — snake_case machine key, immutable after creation

  @IsString()
  @MaxLength(100)
  label: string;

  @IsIn(['text', 'number', 'date', 'boolean', 'select'])
  fieldType: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  options?: string[]; // required when fieldType === 'select'

  @IsOptional()
  @IsBoolean()
  isRequired?: boolean;

  @IsOptional()
  @IsInt()
  sortOrder?: number;
}

export class SetCustomFieldValuesDto {
  /** Map of fieldKey -> value. Unknown keys are rejected; missing required fields are NOT enforced here (enforced on the customer-facing form, not the API, to keep imports/partial updates workable). */
  values: Record<string, string | number | boolean | null>;
}
