import { CreateCustomerDto } from '../../../customers/dto/create-customer.dto';
import { CreatePropertyDto } from '../../../customers/dto/property.dto';
import { CreateEstimateDto, CreateEstimateLineItemDto } from '../../../estimates/dto/create-estimate.dto';
import { SubmitQuoteDto } from '../dto/submit-quote.dto';

/**
 * Explicit, fully-typed mapping from the widget's public input shape to
 * each reused service's real DTO — replaces every `as any` cast that was
 * here in the first pass. Each function's return type is the actual DTO
 * class, so a field rename or type change in any reused DTO shows up
 * here as a real compile error instead of silently drifting.
 */

export function toCreateCustomerDto(dto: SubmitQuoteDto): CreateCustomerDto {
  const customer = new CreateCustomerDto();
  customer.customerType = 'residential';
  customer.firstName = dto.firstName;
  customer.lastName = dto.lastName;
  customer.email = dto.email;
  customer.phone = dto.phone;
  customer.source = dto.leadSource ?? 'website';
  customer.leadStatus = 'lead';
  return customer;
}

export function toCreatePropertyDto(dto: SubmitQuoteDto): CreatePropertyDto {
  const property = new CreatePropertyDto();
  property.addressLine1 = dto.addressLine1;
  property.city = dto.city;
  property.state = dto.state;
  property.postalCode = dto.postalCode;
  return property;
}

export interface CatalogItemForLineItem {
  id: string;
  serviceType: string;
  name: string;
  defaultUnitOfMeasure: string;
  defaultUnitPrice: unknown; // Prisma Decimal — narrowed with Number() below
}

export function toLineItemDto(catalogItem: CatalogItemForLineItem, quantity: number, serviceDetails?: Record<string, unknown>): CreateEstimateLineItemDto {
  const lineItem = new CreateEstimateLineItemDto();
  lineItem.serviceType = catalogItem.serviceType;
  lineItem.description = catalogItem.name;
  lineItem.unitOfMeasure = catalogItem.defaultUnitOfMeasure;
  lineItem.quantity = quantity;
  lineItem.unitPrice = Number(catalogItem.defaultUnitPrice);
  lineItem.serviceDetails = serviceDetails;
  lineItem.serviceCatalogItemId = catalogItem.id;
  return lineItem;
}

export function toCreateEstimateDto(customerId: string, propertyId: string, lineItems: CreateEstimateLineItemDto[], notes: string | undefined, source: string): CreateEstimateDto {
  const estimate = new CreateEstimateDto();
  estimate.customerId = customerId;
  estimate.propertyId = propertyId;
  estimate.lineItems = lineItems;
  estimate.notes = notes;
  estimate.source = source;
  return estimate;
}
