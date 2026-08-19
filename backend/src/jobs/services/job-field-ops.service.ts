import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateChemicalUsageDto, UpdateChemicalUsageDto, CreateEquipmentUsageDto } from '../dto/field-ops.dto';

export interface ChemicalUsageRow {
  id: string;
  chemicalName: string;
  quantity: string;
  unit: string;
  notes: string | null;
  unitCostSnapshot: string | null;
  totalCost: string | null;
  createdAt: Date;
}

export interface EquipmentUsageRow {
  id: string;
  equipmentName: string;
  notes: string | null;
  createdAt: Date;
}

@Injectable()
export class JobFieldOpsService {
  constructor(private readonly prisma: PrismaService) {}

  private async assertJobExists(companyId: string, jobId: string) {
    const rows: { id: string }[] = await this.prisma.withTenantContext(companyId, (tx) => tx.$queryRaw`
      SELECT id FROM jobs WHERE id = ${jobId}::uuid AND company_id = ${companyId}::uuid
    `);
    if (rows.length === 0) throw new NotFoundException('Job not found');
  }

  // ---- Chemical usage ----

  async listChemicalUsage(companyId: string, jobId: string): Promise<ChemicalUsageRow[]> {
    return this.prisma.withTenantContext(companyId, (tx) => tx.$queryRaw`
      SELECT id, chemical_name AS "chemicalName", quantity, unit, notes,
             unit_cost_snapshot AS "unitCostSnapshot", total_cost AS "totalCost", created_at AS "createdAt"
      FROM job_chemical_usage
      WHERE job_id = ${jobId}::uuid AND company_id = ${companyId}::uuid
      ORDER BY created_at ASC
    `);
  }

  /**
   * Cost snapshotting — see migration 041's own comment for the full
   * reasoning. Matches chemical_cost_rates on (company_id, LOWER(name),
   * unit): case-insensitive on the name specifically because this is a
   * free-text field a tech types in the field ("Sodium Hypochlorite" vs
   * "sodium hypochlorite" should still find the same rate), but exact on
   * unit, since unit comes from a small fixed vocabulary already
   * consistent in casing everywhere else in this schema. No match found
   * → both unitCostSnapshot and totalCost stay NULL, never defaulted to
   * $0 — a real, meaningful "cost not yet configured for this chemical"
   * state the reporting layer must be able to see.
   */
  async addChemicalUsage(companyId: string, jobId: string, userId: string, dto: CreateChemicalUsageDto, gps?: { latitude?: number; longitude?: number }) {
    await this.assertJobExists(companyId, jobId);
    return this.prisma.withTenantContext(companyId, async (tx) => {
      const rateRows: { costPerUnit: string }[] = await tx.$queryRaw`
        SELECT cost_per_unit AS "costPerUnit" FROM chemical_cost_rates
        WHERE company_id = ${companyId}::uuid AND LOWER(chemical_name) = LOWER(${dto.chemicalName}) AND unit = ${dto.unit}
        LIMIT 1
      `;
      const unitCostSnapshot = rateRows.length > 0 ? Number(rateRows[0].costPerUnit) : null;
      const totalCost = unitCostSnapshot !== null ? Math.round(Number(dto.quantity) * unitCostSnapshot * 100) / 100 : null;

      const rows = await tx.$queryRaw<ChemicalUsageRow[]>`
        INSERT INTO job_chemical_usage (company_id, job_id, chemical_name, quantity, unit, notes, created_by_user_id, unit_cost_snapshot, total_cost)
        VALUES (${companyId}::uuid, ${jobId}::uuid, ${dto.chemicalName}, ${dto.quantity}, ${dto.unit}, ${dto.notes ?? null}, ${userId}::uuid, ${unitCostSnapshot}, ${totalCost})
        RETURNING id, chemical_name AS "chemicalName", quantity, unit, notes, unit_cost_snapshot AS "unitCostSnapshot", total_cost AS "totalCost", created_at AS "createdAt"
      `;
      const created = rows[0];
      await this.writeAuditLog(tx, companyId, jobId, 'chemical_added', userId, gps, null, created);
      return created;
    });
  }

  async updateChemicalUsage(companyId: string, jobId: string, usageId: string, userId: string, dto: UpdateChemicalUsageDto, gps?: { latitude?: number; longitude?: number }) {
    const existingRows: ChemicalUsageRow[] = await this.prisma.withTenantContext(companyId, (tx) => tx.$queryRaw`
      SELECT id, chemical_name AS "chemicalName", quantity, unit, notes,
             unit_cost_snapshot AS "unitCostSnapshot", total_cost AS "totalCost", created_at AS "createdAt"
      FROM job_chemical_usage WHERE id = ${usageId}::uuid AND job_id = ${jobId}::uuid AND company_id = ${companyId}::uuid
    `);
    if (existingRows.length === 0) throw new NotFoundException('Chemical usage entry not found');
    const previous = existingRows[0];

    return this.prisma.withTenantContext(companyId, async (tx) => {
      const nextChemicalName = dto.chemicalName ?? previous.chemicalName;
      const nextUnit = dto.unit ?? previous.unit;
      const nextQuantity = dto.quantity ?? previous.quantity;

      // Re-snapshot only if the chemical identity itself changed (name
      // or unit) — a genuinely different chemical/unit combination, so
      // the old snapshot no longer means anything. A quantity-only edit
      // deliberately keeps the SAME unit_cost_snapshot and just
      // recomputes total_cost against it — the point of a snapshot is
      // that it doesn't move once set for a given usage record's
      // identity, only the math built on top of it does.
      const identityChanged = dto.chemicalName !== undefined || dto.unit !== undefined;
      let unitCostSnapshot: number | null = previous.unitCostSnapshot !== null ? Number(previous.unitCostSnapshot) : null;
      if (identityChanged) {
        const rateRows: { costPerUnit: string }[] = await tx.$queryRaw`
          SELECT cost_per_unit AS "costPerUnit" FROM chemical_cost_rates
          WHERE company_id = ${companyId}::uuid AND LOWER(chemical_name) = LOWER(${nextChemicalName}) AND unit = ${nextUnit}
          LIMIT 1
        `;
        unitCostSnapshot = rateRows.length > 0 ? Number(rateRows[0].costPerUnit) : null;
      }
      const totalCost = unitCostSnapshot !== null ? Math.round(Number(nextQuantity) * unitCostSnapshot * 100) / 100 : null;

      const rows = await tx.$queryRaw<ChemicalUsageRow[]>`
        UPDATE job_chemical_usage
        SET chemical_name = ${nextChemicalName},
            quantity = ${nextQuantity},
            unit = ${nextUnit},
            notes = ${dto.notes ?? previous.notes},
            unit_cost_snapshot = ${unitCostSnapshot},
            total_cost = ${totalCost},
            updated_at = now()
        WHERE id = ${usageId}::uuid AND company_id = ${companyId}::uuid
        RETURNING id, chemical_name AS "chemicalName", quantity, unit, notes, unit_cost_snapshot AS "unitCostSnapshot", total_cost AS "totalCost", created_at AS "createdAt"
      `;
      const updated = rows[0];
      await this.writeAuditLog(tx, companyId, jobId, 'chemical_updated', userId, gps, previous, updated);
      return updated;
    });
  }

  async removeChemicalUsage(companyId: string, jobId: string, usageId: string, userId: string, gps?: { latitude?: number; longitude?: number }) {
    const existingRows: ChemicalUsageRow[] = await this.prisma.withTenantContext(companyId, (tx) => tx.$queryRaw`
      SELECT id, chemical_name AS "chemicalName", quantity, unit, notes, created_at AS "createdAt"
      FROM job_chemical_usage WHERE id = ${usageId}::uuid AND job_id = ${jobId}::uuid AND company_id = ${companyId}::uuid
    `);
    if (existingRows.length === 0) throw new NotFoundException('Chemical usage entry not found');
    const previous = existingRows[0];

    return this.prisma.withTenantContext(companyId, async (tx) => {
      await tx.$executeRaw`DELETE FROM job_chemical_usage WHERE id = ${usageId}::uuid AND company_id = ${companyId}::uuid`;
      await this.writeAuditLog(tx, companyId, jobId, 'chemical_removed', userId, gps, previous, null);
      return { success: true };
    });
  }

  // ---- Equipment usage ----

  async listEquipmentUsage(companyId: string, jobId: string): Promise<EquipmentUsageRow[]> {
    return this.prisma.withTenantContext(companyId, (tx) => tx.$queryRaw`
      SELECT id, equipment_name AS "equipmentName", notes, created_at AS "createdAt"
      FROM job_equipment_usage
      WHERE job_id = ${jobId}::uuid AND company_id = ${companyId}::uuid
      ORDER BY created_at ASC
    `);
  }

  async addEquipmentUsage(companyId: string, jobId: string, userId: string, dto: CreateEquipmentUsageDto, gps?: { latitude?: number; longitude?: number }) {
    await this.assertJobExists(companyId, jobId);
    return this.prisma.withTenantContext(companyId, async (tx) => {
      const rows = await tx.$queryRaw<EquipmentUsageRow[]>`
        INSERT INTO job_equipment_usage (company_id, job_id, equipment_name, notes, created_by_user_id)
        VALUES (${companyId}::uuid, ${jobId}::uuid, ${dto.equipmentName}, ${dto.notes ?? null}, ${userId}::uuid)
        RETURNING id, equipment_name AS "equipmentName", notes, created_at AS "createdAt"
      `;
      const created = rows[0];
      await this.writeAuditLog(tx, companyId, jobId, 'equipment_added', userId, gps, null, created);
      return created;
    });
  }

  async removeEquipmentUsage(companyId: string, jobId: string, usageId: string, userId: string, gps?: { latitude?: number; longitude?: number }) {
    const existingRows: EquipmentUsageRow[] = await this.prisma.withTenantContext(companyId, (tx) => tx.$queryRaw`
      SELECT id, equipment_name AS "equipmentName", notes, created_at AS "createdAt"
      FROM job_equipment_usage WHERE id = ${usageId}::uuid AND job_id = ${jobId}::uuid AND company_id = ${companyId}::uuid
    `);
    if (existingRows.length === 0) throw new NotFoundException('Equipment usage entry not found');
    const previous = existingRows[0];

    return this.prisma.withTenantContext(companyId, async (tx) => {
      await tx.$executeRaw`DELETE FROM job_equipment_usage WHERE id = ${usageId}::uuid AND company_id = ${companyId}::uuid`;
      await this.writeAuditLog(tx, companyId, jobId, 'equipment_removed', userId, gps, previous, null);
      return { success: true };
    });
  }

  // ---- Check-in (a standalone "I've arrived" GPS ping, distinct from
  // Start Job's GPS capture — a tech may check in on arrival before
  // actually starting billable work, or re-check-in from a different
  // spot on a large property) ----

  async checkIn(companyId: string, jobId: string, userId: string, gps: { latitude?: number; longitude?: number }) {
    await this.assertJobExists(companyId, jobId);
    return this.prisma.withTenantContext(companyId, async (tx) => {
      await this.writeAuditLog(tx, companyId, jobId, 'location_checkin', userId, gps, null, gps);
      return { success: true, latitude: gps.latitude ?? null, longitude: gps.longitude ?? null };
    });
  }

  // ---- Audit log ----

  async listAuditLog(companyId: string, jobId: string) {
    return this.prisma.withTenantContext(companyId, (tx) => tx.$queryRaw`
      SELECT id, action_type AS "actionType", performed_by_user_id AS "performedByUserId",
             latitude, longitude, previous_value AS "previousValue", new_value AS "newValue",
             created_at AS "createdAt"
      FROM job_audit_log
      WHERE job_id = ${jobId}::uuid AND company_id = ${companyId}::uuid
      ORDER BY created_at DESC
    `);
  }

  /**
   * Every field-operations mutation in Phase 2 routes through here.
   * Shared by chemicals, equipment, photos, and completion so the audit
   * trail requirement ("every field operation automatically creates an
   * audit trail") is structurally guaranteed rather than something each
   * call site has to remember to do.
   */
  async writeAuditLog(
    tx: { $executeRaw: (...args: any[]) => Promise<any> },
    companyId: string,
    jobId: string,
    actionType: string,
    userId: string,
    gps: { latitude?: number; longitude?: number } | undefined,
    previousValue: unknown,
    newValue: unknown,
  ) {
    const prevJson = previousValue !== null && previousValue !== undefined ? JSON.stringify(previousValue) : null;
    const newJson = newValue !== null && newValue !== undefined ? JSON.stringify(newValue) : null;
    await tx.$executeRaw`
      INSERT INTO job_audit_log (company_id, job_id, action_type, performed_by_user_id, latitude, longitude, previous_value, new_value)
      VALUES (${companyId}::uuid, ${jobId}::uuid, ${actionType}, ${userId}::uuid, ${gps?.latitude ?? null}, ${gps?.longitude ?? null}, ${prevJson}::jsonb, ${newJson}::jsonb)
    `;
  }
}
