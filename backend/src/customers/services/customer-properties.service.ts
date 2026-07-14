import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreatePropertyDto, UpdatePropertyDto } from '../dto/property.dto';

@Injectable()
export class CustomerPropertiesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(companyId: string, customerId: string) {
    await this.assertCustomerExists(companyId, customerId);
    return this.prisma.property.findMany({ where: { companyId, customerId, deletedAt: null }, orderBy: { createdAt: 'asc' } });
  }

  async create(companyId: string, customerId: string, dto: CreatePropertyDto) {
    await this.assertCustomerExists(companyId, customerId);
    return this.prisma.property.create({
      data: {
        companyId,
        customerId,
        label: dto.label,
        addressLine1: dto.addressLine1,
        city: dto.city,
        state: dto.state,
        postalCode: dto.postalCode,
        latitude: dto.latitude,
        longitude: dto.longitude,
      },
    });
  }

  async update(companyId: string, customerId: string, propertyId: string, dto: UpdatePropertyDto) {
    await this.getOwnedProperty(companyId, customerId, propertyId);
    return this.prisma.property.update({
      where: { id: propertyId },
      data: {
        label: dto.label,
        addressLine1: dto.addressLine1,
        city: dto.city,
        state: dto.state,
        postalCode: dto.postalCode,
        latitude: dto.latitude,
        longitude: dto.longitude,
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
