import { Injectable, NotFoundException } from '@nestjs/common';
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

  async create(companyId: string, customerId: string, dto: CreatePropertyDto) {
    await this.assertCustomerExists(companyId, customerId);
    // Caller-supplied coordinates (if ever sent) win — geocoding only
    // fills in what's actually missing, never overwrites a real value.
    const coords =
      dto.latitude != null && dto.longitude != null
        ? { latitude: dto.latitude, longitude: dto.longitude }
        : await this.geocoding.geocode(dto.addressLine1, dto.city, dto.state, dto.postalCode);
    // A failed/unavailable lookup returns null, not a thrown error — the
    // property still saves with its address text intact, just without
    // coordinates yet. Never blocks customer/property creation.
    return this.prisma.property.create({
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

  private async assertCustomerExists(companyId: string, customerId: string) {
    const customer = await this.prisma.customer.findFirst({ where: { id: customerId, companyId, deletedAt: null } });
    if (!customer) throw new NotFoundException('Customer not found');
  }
}
