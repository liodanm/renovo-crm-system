import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateServiceCatalogItemDto, UpdateServiceCatalogItemDto } from '../dto/service-catalog.dto';

const SELECT_COLUMNS = `
  id, name, service_type AS "serviceType", category, description, is_active AS "isActive",
  default_unit_of_measure AS "defaultUnitOfMeasure", default_unit_price AS "defaultUnitPrice",
  minimum_price AS "minimumPrice", default_labor_hours AS "defaultLaborHours",
  estimated_duration_minutes AS "estimatedDurationMinutes",
  default_chemicals AS "defaultChemicals", default_equipment AS "defaultEquipment", required_equipment AS "requiredEquipment",
  warranty_days AS "warrantyDays", warranty_terms AS "warrantyTerms",
  preparation_instructions AS "preparationInstructions", aftercare_instructions AS "aftercareInstructions",
  default_notes AS "defaultNotes", default_terms AS "defaultTerms",
  suggested_upsell_service_ids AS "suggestedUpsellServiceIds", suggested_future_service_ids AS "suggestedFutureServiceIds",
  sort_order AS "sortOrder", created_at AS "createdAt", updated_at AS "updatedAt"
`;

@Injectable()
export class ServiceCatalogService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(companyId: string, activeOnly = false) {
    const rows: any[] = await this.prisma.tenant.$queryRawUnsafe(
      `SELECT ${SELECT_COLUMNS} FROM service_catalog_items WHERE company_id = $1 ${activeOnly ? 'AND is_active = true' : ''} ORDER BY sort_order ASC, name ASC`,
      companyId,
    );
    return rows;
  }

  async findOne(companyId: string, id: string) {
    const rows: any[] = await this.prisma.tenant.$queryRawUnsafe(
      `SELECT ${SELECT_COLUMNS} FROM service_catalog_items WHERE id = $1 AND company_id = $2`,
      id,
      companyId,
    );
    if (rows.length === 0) throw new NotFoundException('Service catalog item not found');
    return rows[0];
  }

  /**
   * Referential integrity for the suggestion arrays lives here, not the
   * database — Postgres can't put a real FK on an array's elements (see
   * the migration's comment). Every id must exist and belong to this
   * company, checked explicitly rather than trusted.
   */
  private async validateSuggestionIds(companyId: string, ids: string[] | undefined, excludeId?: string): Promise<void> {
    if (!ids || ids.length === 0) return;
    const filtered = excludeId ? ids.filter((id) => id !== excludeId) : ids;
    if (filtered.length === 0) return;
    const rows: { id: string }[] = await this.prisma.tenant.$queryRawUnsafe(
      `SELECT id FROM service_catalog_items WHERE company_id = $1 AND id = ANY($2::uuid[])`,
      companyId,
      filtered,
    );
    if (rows.length !== filtered.length) {
      throw new BadRequestException('One or more suggested services do not exist in this catalog');
    }
  }

  async create(companyId: string, dto: CreateServiceCatalogItemDto) {
    await this.validateSuggestionIds(companyId, dto.suggestedUpsellServiceIds);
    await this.validateSuggestionIds(companyId, dto.suggestedFutureServiceIds);

    const rows: any[] = await this.prisma.tenant.$queryRawUnsafe(
      `INSERT INTO service_catalog_items (
         company_id, name, service_type, category, description, is_active,
         default_unit_of_measure, default_unit_price, minimum_price, default_labor_hours, estimated_duration_minutes,
         default_chemicals, default_equipment, required_equipment,
         warranty_days, warranty_terms, preparation_instructions, aftercare_instructions,
         default_notes, default_terms, suggested_upsell_service_ids, suggested_future_service_ids
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
       RETURNING ${SELECT_COLUMNS}`,
      companyId,
      dto.name,
      dto.serviceType,
      dto.category ?? null,
      dto.description ?? null,
      dto.isActive ?? true,
      dto.defaultUnitOfMeasure ?? null,
      dto.defaultUnitPrice ?? null,
      dto.minimumPrice ?? null,
      dto.defaultLaborHours ?? null,
      dto.estimatedDurationMinutes ?? null,
      JSON.stringify(dto.defaultChemicals ?? []),
      JSON.stringify(dto.defaultEquipment ?? []),
      JSON.stringify(dto.requiredEquipment ?? []),
      dto.warrantyDays ?? null,
      dto.warrantyTerms ?? null,
      dto.preparationInstructions ?? null,
      dto.aftercareInstructions ?? null,
      dto.defaultNotes ?? null,
      dto.defaultTerms ?? null,
      dto.suggestedUpsellServiceIds ?? [],
      dto.suggestedFutureServiceIds ?? [],
    );
    return rows[0];
  }

  async update(companyId: string, id: string, dto: UpdateServiceCatalogItemDto) {
    const existing = await this.findOne(companyId, id);
    await this.validateSuggestionIds(companyId, dto.suggestedUpsellServiceIds, id);
    await this.validateSuggestionIds(companyId, dto.suggestedFutureServiceIds, id);

    const rows: any[] = await this.prisma.tenant.$queryRawUnsafe(
      `UPDATE service_catalog_items SET
         name = $3, service_type = $4, category = $5, description = $6, is_active = $7,
         default_unit_of_measure = $8, default_unit_price = $9, minimum_price = $10,
         default_labor_hours = $11, estimated_duration_minutes = $12,
         default_chemicals = $13, default_equipment = $14, required_equipment = $15,
         warranty_days = $16, warranty_terms = $17, preparation_instructions = $18, aftercare_instructions = $19,
         default_notes = $20, default_terms = $21, suggested_upsell_service_ids = $22, suggested_future_service_ids = $23
       WHERE id = $1 AND company_id = $2
       RETURNING ${SELECT_COLUMNS}`,
      id,
      companyId,
      dto.name ?? existing.name,
      dto.serviceType ?? existing.serviceType,
      dto.category ?? existing.category,
      dto.description ?? existing.description,
      dto.isActive ?? existing.isActive,
      dto.defaultUnitOfMeasure ?? existing.defaultUnitOfMeasure,
      dto.defaultUnitPrice ?? existing.defaultUnitPrice,
      dto.minimumPrice ?? existing.minimumPrice,
      dto.defaultLaborHours ?? existing.defaultLaborHours,
      dto.estimatedDurationMinutes ?? existing.estimatedDurationMinutes,
      JSON.stringify(dto.defaultChemicals ?? existing.defaultChemicals),
      JSON.stringify(dto.defaultEquipment ?? existing.defaultEquipment),
      JSON.stringify(dto.requiredEquipment ?? existing.requiredEquipment),
      dto.warrantyDays ?? existing.warrantyDays,
      dto.warrantyTerms ?? existing.warrantyTerms,
      dto.preparationInstructions ?? existing.preparationInstructions,
      dto.aftercareInstructions ?? existing.aftercareInstructions,
      dto.defaultNotes ?? existing.defaultNotes,
      dto.defaultTerms ?? existing.defaultTerms,
      dto.suggestedUpsellServiceIds ?? existing.suggestedUpsellServiceIds,
      dto.suggestedFutureServiceIds ?? existing.suggestedFutureServiceIds,
    );
    return rows[0];
  }

  /**
   * Soft-disable, never a hard delete — a catalog item that's already
   * referenced by real estimate/job line items (and, once Invoices and
   * Reporting exist, invoices and aggregate reports) must stay queryable
   * for history even after a business stops offering it. is_active is
   * the real "delete" here.
   */
  async archive(companyId: string, id: string) {
    await this.findOne(companyId, id);
    const rows: any[] = await this.prisma.tenant.$queryRawUnsafe(
      `UPDATE service_catalog_items SET is_active = false WHERE id = $1 AND company_id = $2 RETURNING ${SELECT_COLUMNS}`,
      id,
      companyId,
    );
    return rows[0];
  }
}
