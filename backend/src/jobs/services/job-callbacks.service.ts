import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateJobCallbackDto, UpdateJobCallbackDto } from '../dto/job.dto';

/**
 * Deliberately small — "identify return/rework work separately from
 * normal jobs," not a customer-support ticketing system, per the
 * approval doc's explicit scope limit. No status-history table of its
 * own (unlike Job/Estimate) — a callback's lifecycle is short enough
 * that updated_at plus the status field itself is enough; adding a
 * second audit-log pattern here would be exactly the kind of
 * over-engineering the approval doc warned against.
 */
@Injectable()
export class JobCallbacksService {
  constructor(private readonly prisma: PrismaService) {}

  async list(companyId: string, jobId?: string) {
    return this.prisma.withTenantContext(companyId, (tx) => tx.$queryRaw`
      SELECT id, original_job_id AS "originalJobId", new_job_id AS "newJobId", customer_id AS "customerId",
             reason, status, resolution, additional_labor_cost AS "additionalLaborCost",
             additional_material_cost AS "additionalMaterialCost", refund_amount AS "refundAmount",
             notes, created_at AS "createdAt", updated_at AS "updatedAt"
      FROM job_callbacks
      WHERE company_id = ${companyId}::uuid AND (${jobId ?? null}::uuid IS NULL OR original_job_id = ${jobId ?? null}::uuid)
      ORDER BY created_at DESC
    `);
  }

  /**
   * customerId is read from the original job itself, never from the
   * client — see the DTO's own comment. newJobId, if given, must belong
   * to the same customer and company (a callback can't silently point
   * at an unrelated job).
   */
  async create(companyId: string, originalJobId: string, userId: string, dto: CreateJobCallbackDto) {
    return this.prisma.withTenantContext(companyId, async (tx) => {
      const jobRows: { customerId: string }[] = await tx.$queryRaw`
        SELECT customer_id AS "customerId" FROM jobs WHERE id = ${originalJobId}::uuid AND company_id = ${companyId}::uuid
      `;
      if (jobRows.length === 0) throw new NotFoundException('Original job not found');
      const customerId = jobRows[0].customerId;

      if (dto.newJobId) {
        const newJobRows: { customerId: string }[] = await tx.$queryRaw`
          SELECT customer_id AS "customerId" FROM jobs WHERE id = ${dto.newJobId}::uuid AND company_id = ${companyId}::uuid
        `;
        if (newJobRows.length === 0) throw new NotFoundException('New job not found');
        if (newJobRows[0].customerId !== customerId) {
          throw new ForbiddenException('The new job must belong to the same customer as the original job');
        }
      }

      const rows = await tx.$queryRaw<{ id: string }[]>`
        INSERT INTO job_callbacks (company_id, original_job_id, new_job_id, customer_id, reason, notes, created_by_user_id)
        VALUES (${companyId}::uuid, ${originalJobId}::uuid, ${dto.newJobId ?? null}::uuid, ${customerId}::uuid, ${dto.reason}, ${dto.notes ?? null}, ${userId}::uuid)
        RETURNING id
      `;
      return this.findOne(companyId, rows[0].id, tx);
    });
  }

  async findOne(companyId: string, id: string, txOverride?: { $queryRaw: any }) {
    const run = (client: { $queryRaw: any }) => client.$queryRaw`
      SELECT id, original_job_id AS "originalJobId", new_job_id AS "newJobId", customer_id AS "customerId",
             reason, status, resolution, additional_labor_cost AS "additionalLaborCost",
             additional_material_cost AS "additionalMaterialCost", refund_amount AS "refundAmount",
             notes, created_at AS "createdAt", updated_at AS "updatedAt"
      FROM job_callbacks WHERE id = ${id}::uuid AND company_id = ${companyId}::uuid
    `;
    const rows = txOverride ? await run(txOverride) : await this.prisma.withTenantContext(companyId, run);
    if (rows.length === 0) throw new NotFoundException('Job callback not found');
    return rows[0];
  }

  async update(companyId: string, id: string, dto: UpdateJobCallbackDto) {
    return this.prisma.withTenantContext(companyId, async (tx) => {
      const existing = await this.findOne(companyId, id, tx);

      if (dto.newJobId) {
        const newJobRows: { customerId: string }[] = await tx.$queryRaw`
          SELECT customer_id AS "customerId" FROM jobs WHERE id = ${dto.newJobId}::uuid AND company_id = ${companyId}::uuid
        `;
        if (newJobRows.length === 0) throw new NotFoundException('New job not found');
        if (newJobRows[0].customerId !== existing.customerId) {
          throw new ForbiddenException('The new job must belong to the same customer as the original job');
        }
      }

      // Same explicit `in dto` pattern as UpdateJobLineItemActualCostsDto
      // — an explicit null clears a value, omitting a field leaves it
      // untouched. Real for these fields specifically: a refund amount
      // entered by mistake needs to be clearable back to "no refund,"
      // not just replaceable with a different number.
      const next = {
        status: dto.status ?? existing.status,
        resolution: dto.resolution ?? existing.resolution,
        newJobId: 'newJobId' in dto ? dto.newJobId ?? null : existing.newJobId,
        additionalLaborCost: 'additionalLaborCost' in dto ? dto.additionalLaborCost ?? null : existing.additionalLaborCost,
        additionalMaterialCost: 'additionalMaterialCost' in dto ? dto.additionalMaterialCost ?? null : existing.additionalMaterialCost,
        refundAmount: 'refundAmount' in dto ? dto.refundAmount ?? null : existing.refundAmount,
        notes: dto.notes ?? existing.notes,
      };

      await tx.$executeRaw`
        UPDATE job_callbacks SET
          status = ${next.status},
          resolution = ${next.resolution},
          new_job_id = ${next.newJobId}::uuid,
          additional_labor_cost = ${next.additionalLaborCost},
          additional_material_cost = ${next.additionalMaterialCost},
          refund_amount = ${next.refundAmount},
          notes = ${next.notes},
          updated_at = now()
        WHERE id = ${id}::uuid AND company_id = ${companyId}::uuid
      `;

      return this.findOne(companyId, id, tx);
    });
  }

  /**
   * Callback Rate = Callback Jobs / Completed Jobs, per the approval
   * doc's exact definition. "Callback Jobs" here means distinct original
   * jobs that have at least one callback record, not a raw callback
   * count — a job called back twice still only counts once as "a job
   * that needed a callback," which is the actual operational signal the
   * rate is meant to capture.
   */
  async getCallbackRate(companyId: string, start: Date, end: Date) {
    const rows: { completedJobs: string; callbackJobs: string }[] = await this.prisma.withTenantContext(companyId, (tx) => tx.$queryRaw`
      WITH completed AS (
        SELECT id FROM jobs WHERE company_id = ${companyId}::uuid AND status = 'completed' AND actual_end >= ${start} AND actual_end < ${end}
      )
      SELECT
        (SELECT COUNT(*) FROM completed) AS "completedJobs",
        (SELECT COUNT(DISTINCT jc.original_job_id) FROM job_callbacks jc JOIN completed c ON c.id = jc.original_job_id) AS "callbackJobs"
    `);
    const completedJobs = Number(rows[0]?.completedJobs ?? 0);
    const callbackJobs = Number(rows[0]?.callbackJobs ?? 0);
    return {
      completedJobs,
      callbackJobs,
      callbackRatePercent: completedJobs > 0 ? Math.round((callbackJobs / completedJobs) * 10000) / 100 : null,
    };
  }
}
