import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { GeocodingService } from '../../geocoding/geocoding.service';
import { CreatePropertyDto, UpdatePropertyDto } from '../dto/property.dto';

@Injectable()
export class CustomerPropertiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly geocoding: GeocodingService,
  ) {}

  async list(companyId: string, customerId: string) {
    await this.assertCustomerExists(companyId, customerId);
    return this.prisma.property.findMany({ where: { companyId, customerId, deletedAt: null }, orderBy: { createdAt: 'asc' } });
  }

  /**
   * Optional `tx` (Instant Quote atomicity fix): when provided, this
   * write uses the SAME transaction as the Customer/Estimate creation
   * that call it (see QuoteWidgetService.submitQuote) instead of its own
   * separate, un-transacted write — closing the orphaned-Property gap
   * the same way create() above was fixed.
   *
   * Also fixes a related, real inefficiency found while building this:
   * dto.latitude/dto.longitude now always arrive already-resolved from
   * the Quote Tool (the address was already geocoded once, at the
   * property-lookup step, before the customer ever reaches submission —
   * see SubmitQuoteDto/PropertyLookupResult) — so the live Nominatim
   * call below is now the TRUE fallback it always should have been, not
   * something that silently re-geocoded the same address a second time
   * on every single Quote Tool submission. This also matters for
   * transaction safety specifically: an external HTTP call genuinely
   * executing while a database transaction is open would be a real
   * problem (long-held locks) — with coordinates already provided by
   * the Quote Tool's real callers, that call path is no longer reached
   * during the atomic submission at all.
   */
  async create(companyId: string, customerId: string, dto: CreatePropertyDto, tx?: Prisma.TransactionClient) {
    const db = tx ?? this.prisma;
    await this.assertCustomerExists(companyId, customerId, tx);
    // Caller-supplied coordinates (if ever sent) win — geocoding only
    // fills in what's actually missing, never overwrites a real value.
    const coords =
      dto.latitude != null && dto.longitude != null
        ? { latitude: dto.latitude, longitude: dto.longitude }
        : await this.geocoding.geocode(dto.addressLine1, dto.city, dto.state, dto.postalCode);
    // A failed/unavailable lookup returns null, not a thrown error — the
    // property still saves with its address text intact, just without
    // coordinates yet. Never blocks customer/property creation.
    return db.property.create({
      data: {
        companyId,
        customerId,
        label: dto.label,
        addressLine1: dto.addressLine1,
        city: dto.city,
        state: dto.state,
        postalCode: dto.postalCode,
        latitude: coords?.latitude,
        longitude: coords?.longitude,
      },
    });
  }

  async update(companyId: string, customerId: string, propertyId: string, dto: UpdatePropertyDto) {
    const existing = await this.getOwnedProperty(companyId, customerId, propertyId);

    // Only re-geocode when an address component is actually part of this
    // update — editing just the label (or anything else) shouldn't cost
    // a geocoding call at all, not even a cache-hit one. When it is
    // warranted, geocode the full merged address (new values where
    // given, the property's current values everywhere else), since a
    // partial PATCH updating only city still needs the whole address to
    // look up correctly.
    const addressChanging = dto.addressLine1 !== undefined || dto.city !== undefined || dto.state !== undefined || dto.postalCode !== undefined;
    let coords: { latitude: number; longitude: number } | null = null;
    if (dto.latitude != null && dto.longitude != null) {
      coords = { latitude: dto.latitude, longitude: dto.longitude };
    } else if (addressChanging) {
      coords = await this.geocoding.geocode(
        dto.addressLine1 ?? existing.addressLine1,
        dto.city ?? existing.city,
        dto.state ?? existing.state,
        dto.postalCode ?? existing.postalCode,
      );
    }

    return this.prisma.property.update({
      where: { id: propertyId },
      data: {
        label: dto.label,
        addressLine1: dto.addressLine1,
        city: dto.city,
        state: dto.state,
        postalCode: dto.postalCode,
        // Only overwritten when this update actually looked up new
        // coordinates — an edit that doesn't touch the address keeps
        // whatever coordinates the property already had.
        ...(coords ? { latitude: coords.latitude, longitude: coords.longitude } : {}),
      },
    });
  }

  async delete(companyId: string, customerId: string, propertyId: string) {
    await this.getOwnedProperty(companyId, customerId, propertyId);
    // Soft delete only — jobs/estimates/photos reference this property and
    // must keep working for historical records even after it's "removed"
    // from the active property list.
    await this.prisma.property.update({ where: { id: propertyId }, data: { deletedAt: new Date() } });
    return { message: 'Property removed' };
  }

  private async getOwnedProperty(companyId: string, customerId: string, propertyId: string) {
    const property = await this.prisma.property.findFirst({
      where: { id: propertyId, companyId, customerId, deletedAt: null },
    });
    if (!property) throw new NotFoundException('Property not found');
    return property;
  }

  private async assertCustomerExists(companyId: string, customerId: string, tx?: Prisma.TransactionClient) {
    // Critical for the atomic path: within the outer Instant Quote
    // transaction, the Customer row may have been created moments
    // earlier in that SAME still-open transaction and is not yet
    // committed — a read on `this.prisma` (a different connection)
    // would not see it and would wrongly report "not found". Must use
    // the same `tx` to see consistent, in-progress transaction state.
    const db = tx ?? this.prisma;
    const customer = await db.customer.findFirst({ where: { id: customerId, companyId, deletedAt: null } });
    if (!customer) throw new NotFoundException('Customer not found');
  }
}
