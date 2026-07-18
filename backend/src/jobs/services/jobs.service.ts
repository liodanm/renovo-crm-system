import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { UpdateJobDto, PauseJobDto, QueryJobsDto } from '../dto/job.dto';
import { CompleteJobDetailsDto, GpsCoordinatesDto } from '../dto/field-ops.dto';
import { assertValidTransition, calculateLaborHours } from './job-status.util';
import { JobFieldOpsService } from './job-field-ops.service';

@Injectable()
export class JobsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly fieldOps: JobFieldOpsService,
  ) {}

  /**
   * The real Estimate -> Job conversion. Owned here (not EstimatesService)
   * since Jobs owns the Job entity. Line items are copied row by row —
   * description, quantity, unitPrice, serviceType, unitOfMeasure,
   * serviceDetails — a real preservation, not a lossy summary.
   */
  async createFromEstimate(companyId: string, estimateId: string) {
    const estimateRows = await this.prisma.tenant.$queryRaw<
      { id: string; customerId: string; propertyId: string; status: string; totalAmount: string; notes: string | null }[]
    >`
      SELECT id, customer_id AS "customerId", property_id AS "propertyId", status, total_amount AS "totalAmount", notes
      FROM estimates WHERE id = ${estimateId}::uuid AND company_id = ${companyId}::uuid
    `;
    if (estimateRows.length === 0) throw new NotFoundException('Estimate not found');
    const estimate = estimateRows[0];
    if (estimate.status !== 'accepted') {
      throw new BadRequestException(`Cannot convert an estimate with status '${estimate.status}' to a job — only accepted estimates can be converted`);
    }

    return this.prisma.withTenantContext(companyId, async (tx) => {
      const existing = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM jobs WHERE estimate_id = ${estimateId}::uuid AND company_id = ${companyId}::uuid
      `;
      if (existing.length > 0) return this.findOne(companyId, existing[0].id);

      const lineItems = await tx.$queryRaw<
        { description: string; quantity: string; unitPrice: string; serviceType: string | null; unitOfMeasure: string | null; serviceDetails: unknown; notes: string | null; sortOrder: number; serviceCatalogItemId: string | null }[]
      >`
        SELECT description, quantity, unit_price AS "unitPrice", service_type AS "serviceType",
               unit_of_measure AS "unitOfMeasure", service_details AS "serviceDetails", notes, sort_order AS "sortOrder",
               service_catalog_item_id AS "serviceCatalogItemId"
        FROM estimate_line_items WHERE estimate_id = ${estimateId}::uuid AND company_id = ${companyId}::uuid
        ORDER BY sort_order ASC
      `;

      const jobNumber = `JOB-${Date.now().toString().slice(-6)}`;
      const primaryServiceType = lineItems[0]?.serviceType ?? null;
      const title = lineItems.map((li) => li.description).join(', ').slice(0, 200) || 'Job from estimate';

      const jobRows = await tx.$queryRaw<{ id: string }[]>`
        INSERT INTO jobs (company_id, customer_id, property_id, estimate_id, job_number, title, service_type, status, price, notes)
        VALUES (${companyId}::uuid, ${estimate.customerId}::uuid, ${estimate.propertyId}::uuid, ${estimateId}::uuid, ${jobNumber}, ${title}, ${primaryServiceType}, 'draft', ${estimate.totalAmount}, ${estimate.notes})
        RETURNING id
      `;
      const jobId = jobRows[0].id;

      for (let i = 0; i < lineItems.length; i++) {
        const li = lineItems[i];
        const serviceDetailsJson = li.serviceDetails ? JSON.stringify(li.serviceDetails) : null;
        await tx.$executeRaw`
          INSERT INTO job_line_items (company_id, job_id, description, quantity, unit_price, sort_order, service_type, unit_of_measure, service_details, notes, service_catalog_item_id)
          VALUES (${companyId}::uuid, ${jobId}::uuid, ${li.description}, ${li.quantity}, ${li.unitPrice}, ${i}, ${li.serviceType}, ${li.unitOfMeasure}, ${serviceDetailsJson}::jsonb, ${li.notes}, ${li.serviceCatalogItemId}::uuid)
        `;
      }

      await tx.$executeRaw`
        INSERT INTO job_status_history (company_id, job_id, from_status, to_status, note)
        VALUES (${companyId}::uuid, ${jobId}::uuid, NULL, 'draft', 'Created from accepted estimate')
      `;

      return this.findOne(companyId, jobId, tx);
    });
  }

  async findAll(companyId: string, query: QueryJobsDto) {
    return this.prisma.tenant.$queryRaw`
      SELECT j.id, j.job_number AS "jobNumber", j.title, j.status, j.price, j.customer_id AS "customerId", j.property_id AS "propertyId",
             c.first_name AS "customerFirstName", c.last_name AS "customerLastName", c.business_name AS "customerBusinessName",
             p.address_line1 AS "propertyAddressLine1", p.city AS "propertyCity", p.state AS "propertyState"
      FROM jobs j
      JOIN customers c ON c.id = j.customer_id
      JOIN properties p ON p.id = j.property_id
      WHERE j.company_id = ${companyId}::uuid
        AND (${query.status ?? null}::text IS NULL OR j.status = ${query.status ?? null})
        AND (${query.customerId ?? null}::uuid IS NULL OR j.customer_id = ${query.customerId ?? null}::uuid)
      ORDER BY j.created_at DESC
    `;
  }

  async findOne(companyId: string, id: string, txOverride?: { $queryRaw: any }) {
    const client = txOverride ?? this.prisma.tenant;
    const jobRows = await client.$queryRaw<any[]>`
      SELECT j.*, j.job_number AS "jobNumber", j.customer_id AS "customerId", j.property_id AS "propertyId",
             j.estimate_id AS "estimateId", j.assigned_user_id AS "assignedUserId",
             j.internal_notes AS "internalNotes", j.calculated_labor_hours AS "calculatedLaborHours",
             j.billable_labor_hours AS "billableLaborHours", j.actual_start AS "actualStart", j.actual_end AS "actualEnd",
             j.scheduled_start AS "scheduledStart", j.scheduled_end AS "scheduledEnd",
             j.start_latitude AS "startLatitude", j.start_longitude AS "startLongitude",
             j.end_latitude AS "endLatitude", j.end_longitude AS "endLongitude",
             j.customer_signature_data_url AS "customerSignatureDataUrl",
             j.signature_unavailable_reason AS "signatureUnavailableReason",
             j.completion_notes AS "completionNotes", j.recommended_future_services AS "recommendedFutureServices",
             j.created_at AS "createdAt",
             c.first_name AS "customerFirstName", c.last_name AS "customerLastName", c.business_name AS "customerBusinessName",
             p.address_line1 AS "propertyAddressLine1", p.city AS "propertyCity", p.state AS "propertyState"
      FROM jobs j
      JOIN customers c ON c.id = j.customer_id
      JOIN properties p ON p.id = j.property_id
      WHERE j.id = ${id}::uuid AND j.company_id = ${companyId}::uuid
    `;
    if (jobRows.length === 0) throw new NotFoundException('Job not found');
    const job = jobRows[0];

    const lineItems = await client.$queryRaw`
      SELECT id, description, quantity, unit_price AS "unitPrice", total, service_type AS "serviceType",
             unit_of_measure AS "unitOfMeasure", service_details AS "serviceDetails", notes,
             service_catalog_item_id AS "serviceCatalogItemId"
      FROM job_line_items WHERE job_id = ${id}::uuid AND company_id = ${companyId}::uuid ORDER BY sort_order ASC
    `;
    const statusHistory = await client.$queryRaw`
      SELECT id, from_status AS "fromStatus", to_status AS "toStatus", note, changed_at AS "changedAt", latitude, longitude
      FROM job_status_history WHERE job_id = ${id}::uuid AND company_id = ${companyId}::uuid ORDER BY changed_at DESC
    `;

    return { ...job, lineItems, statusHistory };
  }

  async update(companyId: string, id: string, dto: UpdateJobDto) {
    const existing = await this.findOne(companyId, id);
    if (!['draft', 'scheduled'].includes(existing.status)) {
      throw new BadRequestException(`Cannot edit a job with status '${existing.status}' — only draft or scheduled jobs can be edited`);
    }
    if (dto.assignedUserId) {
      const belongs = await this.prisma.tenant.$queryRaw<{ id: string }[]>`
        SELECT id FROM company_users WHERE user_id = ${dto.assignedUserId}::uuid AND company_id = ${companyId}::uuid
      `;
      if (belongs.length === 0) throw new ForbiddenException('That user is not a member of this company');
    }

    await this.prisma.tenant.$executeRaw`
      UPDATE jobs SET
        title = ${dto.title ?? existing.title},
        description = ${dto.description ?? existing.description},
        notes = ${dto.notes ?? existing.notes},
        internal_notes = ${dto.internalNotes ?? existing.internalNotes},
        assigned_user_id = ${dto.assignedUserId ?? existing.assignedUserId ?? null}::uuid,
        updated_at = now()
      WHERE id = ${id}::uuid AND company_id = ${companyId}::uuid
    `;
    return this.findOne(companyId, id);
  }

  async start(companyId: string, id: string, userId: string, gps: GpsCoordinatesDto) {
    const job = await this.findOne(companyId, id);
    assertValidTransition(job.status, 'in_progress', 'start');

    return this.prisma.withTenantContext(companyId, async (tx) => {
      await tx.$executeRaw`
        UPDATE jobs SET status = 'in_progress', actual_start = now(),
          start_latitude = ${gps.latitude ?? null}, start_longitude = ${gps.longitude ?? null}, updated_at = now()
        WHERE id = ${id}::uuid AND company_id = ${companyId}::uuid
      `;
      await tx.$executeRaw`
        INSERT INTO job_status_history (company_id, job_id, from_status, to_status, changed_by_user_id, latitude, longitude)
        VALUES (${companyId}::uuid, ${id}::uuid, ${job.status}, 'in_progress', ${userId}::uuid, ${gps.latitude ?? null}, ${gps.longitude ?? null})
      `;
      return this.findOne(companyId, id, tx);
    });
  }

  async pause(companyId: string, id: string, userId: string, dto: PauseJobDto) {
    const job = await this.findOne(companyId, id);
    assertValidTransition(job.status, 'paused', 'pause');

    return this.prisma.withTenantContext(companyId, async (tx) => {
      await tx.$executeRaw`UPDATE jobs SET status = 'paused', updated_at = now() WHERE id = ${id}::uuid AND company_id = ${companyId}::uuid`;
      await tx.$executeRaw`
        INSERT INTO job_status_history (company_id, job_id, from_status, to_status, changed_by_user_id, note)
        VALUES (${companyId}::uuid, ${id}::uuid, ${job.status}, 'paused', ${userId}::uuid, ${dto.note ?? null})
      `;
      return this.findOne(companyId, id, tx);
    });
  }

  async resume(companyId: string, id: string, userId: string) {
    const job = await this.findOne(companyId, id);
    assertValidTransition(job.status, 'in_progress', 'resume');

    return this.prisma.withTenantContext(companyId, async (tx) => {
      await tx.$executeRaw`UPDATE jobs SET status = 'in_progress', updated_at = now() WHERE id = ${id}::uuid AND company_id = ${companyId}::uuid`;
      await tx.$executeRaw`
        INSERT INTO job_status_history (company_id, job_id, from_status, to_status, changed_by_user_id)
        VALUES (${companyId}::uuid, ${id}::uuid, ${job.status}, 'in_progress', ${userId}::uuid)
      `;
      return this.findOne(companyId, id, tx);
    });
  }

  /**
   * Complete Job — the one action that gathers everything Phase 2 added:
   * GPS check-out, labor-hour calculation, signature (or a real reason
   * it's unavailable), completion notes, and recommended future
   * services. Signature is genuinely optional per explicit decision —
   * this never blocks completion.
   */
  async complete(companyId: string, id: string, userId: string, dto: CompleteJobDetailsDto) {
    const job = await this.findOne(companyId, id);
    assertValidTransition(job.status, 'completed', 'complete');
    if (!job.actualStart) {
      throw new BadRequestException('This job has no recorded start time — cannot calculate labor hours');
    }
    if (dto.customerSignatureDataUrl && dto.signatureUnavailableReason) {
      throw new BadRequestException('Provide either a signature or an unavailable reason, not both');
    }

    const actualEnd = new Date();
    const calculatedLaborHours = calculateLaborHours(new Date(job.actualStart), actualEnd);
    const billableLaborHours = dto.billableLaborHours ?? calculatedLaborHours;
    const recommendedServices = dto.recommendedFutureServices ?? [];

    return this.prisma.withTenantContext(companyId, async (tx) => {
      await tx.$executeRaw`
        UPDATE jobs SET
          status = 'completed', actual_end = ${actualEnd},
          end_latitude = ${dto.latitude ?? null}, end_longitude = ${dto.longitude ?? null},
          calculated_labor_hours = ${calculatedLaborHours}, billable_labor_hours = ${billableLaborHours},
          customer_signature_data_url = ${dto.customerSignatureDataUrl ?? null},
          signature_unavailable_reason = ${dto.signatureUnavailableReason ?? null},
          completion_notes = ${dto.completionNotes ?? null},
          recommended_future_services = ${recommendedServices},
          updated_at = now()
        WHERE id = ${id}::uuid AND company_id = ${companyId}::uuid
      `;
      await tx.$executeRaw`
        INSERT INTO job_status_history (company_id, job_id, from_status, to_status, changed_by_user_id, note, latitude, longitude)
        VALUES (${companyId}::uuid, ${id}::uuid, ${job.status}, 'completed', ${userId}::uuid, ${dto.note ?? null}, ${dto.latitude ?? null}, ${dto.longitude ?? null})
      `;
      if (dto.customerSignatureDataUrl) {
        await this.fieldOps.writeAuditLog(tx, companyId, id, 'signature_captured', userId, dto, null, { captured: true });
      }
      if (dto.completionNotes) {
        await this.fieldOps.writeAuditLog(tx, companyId, id, 'completion_notes_updated', userId, dto, job.completionNotes, dto.completionNotes);
      }
      return this.findOne(companyId, id, tx);
    });
  }
}
