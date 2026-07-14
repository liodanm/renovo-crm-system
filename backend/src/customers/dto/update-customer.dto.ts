import { PartialType, OmitType } from '@nestjs/mapped-types';
import { CreateCustomerDto } from './create-customer.dto';

/**
 * Properties are managed via their own nested endpoints
 * (POST/PATCH/DELETE /customers/:id/properties) rather than through a
 * bulk-replace on customer update — replacing a list wholesale on PATCH
 * is a common source of accidental data loss (a client sending a stale
 * properties array would silently delete newly-added ones).
 */
export class UpdateCustomerDto extends PartialType(OmitType(CreateCustomerDto, ['properties'] as const)) {}
