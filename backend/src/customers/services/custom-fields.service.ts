import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateCustomFieldDefinitionDto, SetCustomFieldValuesDto } from '../dto/custom-field.dto';

const FIELD_KEY_PATTERN = /^[a-z][a-z0-9_]{1,49}$/;

@Injectable()
export class CustomFieldsService {
  constructor(private readonly prisma: PrismaService) {}

  async listDefinitions(companyId: string, entityType: string) {
    return this.prisma.customFieldDefinition.findMany({
      where: { companyId, entityType },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async createDefinition(companyId: string, dto: CreateCustomFieldDefinitionDto) {
    if (!FIELD_KEY_PATTERN.test(dto.fieldKey)) {
      throw new BadRequestException('fieldKey must be lowercase snake_case (e.g. "gate_code")');
    }
    if (dto.fieldType === 'select' && (!dto.options || dto.options.length === 0)) {
      throw new BadRequestException('options are required for a "select" field type');
    }

    const existing = await this.prisma.customFieldDefinition.findUnique({
      where: { companyId_entityType_fieldKey: { companyId, entityType: dto.entityType, fieldKey: dto.fieldKey } },
    });
    if (existing) {
      throw new BadRequestException(`A "${dto.entityType}" field with key "${dto.fieldKey}" already exists`);
    }

    return this.prisma.customFieldDefinition.create({
      data: {
        companyId,
        entityType: dto.entityType,
        fieldKey: dto.fieldKey,
        label: dto.label,
        fieldType: dto.fieldType,
        options: dto.options,
        isRequired: dto.isRequired ?? false,
        sortOrder: dto.sortOrder ?? 0,
      },
    });
  }

  async deleteDefinition(companyId: string, definitionId: string) {
    const definition = await this.prisma.customFieldDefinition.findFirst({ where: { id: definitionId, companyId } });
    if (!definition) throw new NotFoundException('Custom field not found');
    // Cascades to custom_field_values via the FK — deleting a field
    // definition intentionally discards every value ever recorded for it;
    // the frontend confirms this explicitly before calling delete.
    await this.prisma.customFieldDefinition.delete({ where: { id: definitionId } });
    return { message: 'Custom field deleted' };
  }

  /**
   * Bulk-sets values for an entity in one call (the profile form saves the
   * whole custom-fields section at once, not field-by-field) using
   * upsert-per-field inside a transaction.
   */
  async setValues(companyId: string, entityType: string, entityId: string, dto: SetCustomFieldValuesDto) {
    const definitions = await this.prisma.customFieldDefinition.findMany({ where: { companyId, entityType } });
    const byKey = new Map(definitions.map((d): [string, typeof d] => [d.fieldKey, d]));

    const unknownKeys = Object.keys(dto.values).filter((k) => !byKey.has(k));
    if (unknownKeys.length > 0) {
      throw new BadRequestException(`Unknown custom field key(s): ${unknownKeys.join(', ')}`);
    }

    await this.prisma.$transaction(
      Object.entries(dto.values).map(([key, value]) => {
        const definition = byKey.get(key)!;
        return this.prisma.customFieldValue.upsert({
          where: { fieldDefinitionId_entityId: { fieldDefinitionId: definition.id, entityId } },
          create: { companyId, fieldDefinitionId: definition.id, entityId, value: value as any },
          update: { value: value as any },
        });
      }),
    );

    return this.getValuesForEntity(companyId, entityId);
  }

  async getValuesForEntity(companyId: string, entityId: string) {
    const values = await this.prisma.customFieldValue.findMany({
      where: { companyId, entityId },
      include: { fieldDefinition: true },
    });
    return values.map((v) => ({
      fieldKey: v.fieldDefinition.fieldKey,
      label: v.fieldDefinition.label,
      fieldType: v.fieldDefinition.fieldType,
      value: v.value,
    }));
  }
}
