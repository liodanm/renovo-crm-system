import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ScheduleJobDto, RescheduleAppointmentDto, UpdateAppointmentAssignmentDto, QueryCalendarDto } from '../dto/scheduling.dto';
import { resolveArrivalWindowMinutes } from './arrival-window.util';

const CALENDAR_SELECT = `
  a.id, a.appointment_type AS "appointmentType", a.starts_at AS "startsAt", a.ends_at AS "endsAt",
  a.all_day AS "allDay", a.status, a.arrival_window_minutes AS "arrivalWindowMinutes",
  a.job_id AS "jobId", a.estimate_id AS "estimateId", a.title,
  c.id AS "customerId", c.first_name AS "customerFirstName", c.last_name AS "customerLastName",
  c.business_name AS "customerBusinessName", c.phone AS "customerPhone",
  p.id AS "propertyId", p.address_line1 AS "propertyAddressLine1", p.city AS "propertyCity",
  p.state AS "propertyState", p.latitude AS "propertyLatitude", p.longitude AS "propertyLongitude",
  cu.id AS "assignedCompanyUserId", u.first_name AS "technicianFirstName", u.last_name AS "technicianLastName",
  j.status AS "jobStatus", j.price AS "jobPrice", j.job_number AS "jobNumber"
`;

const CALENDAR_JOINS = `
  FROM appointments a
  LEFT JOIN customers c ON c.id = a.customer_id
  LEFT JOIN properties p ON p.id = a.property_id
  LEFT JOIN company_users cu ON cu.id = a.assigned_to_company_user_id
  LEFT JOIN users u ON u.id = cu.user_id
  LEFT JOIN jobs j ON j.id = a.job_id
`;

@Injectable()
export class SchedulingService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The one and only path that puts a date on a job. Writes the
   * appointment first (the real source of truth per the approved
   * architecture), then syncs jobs.scheduled_start/scheduled_end as a
   * denormalized convenience field — never the other way around.
   */
  async scheduleJob(companyId: string, jobId: string, userId: string, dto: ScheduleJobDto) {
    const jobRows = await this.prisma.tenant.$queryRaw<
      { id: string; customerId: string; propertyId: string; title: string; status: string }[]
    >`SELECT id, customer_id AS "customerId", property_id AS "propertyId", title, status FROM jobs WHERE id = ${jobId}::uuid AND company_id = ${companyId}::uuid`;
    if (jobRows.length === 0) throw new NotFoundException('Job not found');
    const job = jobRows[0];

    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(dto.endsAt);
    if (endsAt < startsAt) throw new BadRequestException('endsAt must not be before startsAt');

    if (dto.assignedUserId) {
      const belongs = await this.prisma.tenant.$queryRaw<{ id: string }[]>`
        SELECT id FROM company_users WHERE user_id = ${dto.assignedUserId}::uuid AND company_id = ${companyId}::uuid
      `;
      if (belongs.length === 0) throw new ForbiddenException('That user is not a member of this company');
    }

    return this.prisma.withTenantContext(companyId, async (tx) => {
      const assignedCompanyUserRows = dto.assignedUserId
        ? await tx.$queryRaw<{ id: string }[]>`SELECT id FROM company_users WHERE user_id = ${dto.assignedUserId}::uuid AND company_id = ${companyId}::uuid`
        : [];
      const assignedCompanyUserId = assignedCompanyUserRows[0]?.id ?? null;

      const existing = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM appointments WHERE job_id = ${jobId}::uuid AND company_id = ${companyId}::uuid`;

      let appointmentId: string;
      if (existing.length > 0) {
        appointmentId = existing[0].id;
        await tx.$executeRaw`
          UPDATE appointments SET
            starts_at = ${startsAt}, ends_at = ${endsAt}, title = ${job.title},
            arrival_window_minutes = ${dto.arrivalWindowMinutes ?? null},
            assigned_to_company_user_id = COALESCE(${assignedCompanyUserId}::uuid, assigned_to_company_user_id),
            status = 'scheduled', updated_at = now()
          WHERE id = ${appointmentId}::uuid
        `;
      } else {
        const inserted = await tx.$queryRaw<{ id: string }[]>`
          INSERT INTO appointments (company_id, appointment_type, job_id, customer_id, property_id, title, starts_at, ends_at, arrival_window_minutes, assigned_to_company_user_id, status)
          VALUES (${companyId}::uuid, 'job', ${jobId}::uuid, ${job.customerId}::uuid, ${job.propertyId}::uuid, ${job.title}, ${startsAt}, ${endsAt}, ${dto.arrivalWindowMinutes ?? null}, ${assignedCompanyUserId}::uuid, 'scheduled')
          RETURNING id
        `;
        appointmentId = inserted[0].id;
      }

      // Sync — denormalized convenience fields only, per the approved
      // architecture. A draft job that gets a date becomes scheduled;
      // a job already further along (in_progress, etc.) keeps its real
      // status — scheduling doesn't rewind an active job.
      await tx.$executeRaw`
        UPDATE jobs SET
          scheduled_start = ${startsAt}, scheduled_end = ${endsAt},
          assigned_user_id = COALESCE(${dto.assignedUserId ?? null}::uuid, assigned_user_id),
          status = CASE WHEN status = 'draft' THEN 'scheduled' ELSE status END,
          updated_at = now()
        WHERE id = ${jobId}::uuid AND company_id = ${companyId}::uuid
      `;

      return this.getAppointment(companyId, appointmentId, tx);
    });
  }

  async getCalendar(companyId: string, query: QueryCalendarDto) {
    const start = new Date(query.start);
    const end = new Date(query.end);
    const searchPattern = query.search ? `%${query.search}%` : null;

    const rows: any[] = await this.prisma.tenant.$queryRawUnsafe(
      `SELECT ${CALENDAR_SELECT} ${CALENDAR_JOINS}
       WHERE a.company_id = $1 AND a.starts_at < $2 AND a.ends_at >= $3
         AND ($4::text IS NULL OR a.status = $4)
         AND ($5::uuid IS NULL OR cu.id = $5::uuid)
         AND ($6::text IS NULL OR c.first_name ILIKE $6 OR c.last_name ILIKE $6 OR c.business_name ILIKE $6 OR p.address_line1 ILIKE $6)
       ORDER BY a.starts_at ASC`,
      companyId,
      end,
      start,
      query.status ?? null,
      query.assignedUserId ?? null,
      searchPattern,
    );

    return Promise.all(rows.map((r) => this.enrichAppointment(companyId, r)));
  }

  async getAppointment(companyId: string, id: string, txOverride?: { $queryRawUnsafe: (query: string, ...values: any[]) => Promise<any> }) {
    const client = txOverride ?? this.prisma.tenant;
    const rows: any[] = await client.$queryRawUnsafe(
      `SELECT ${CALENDAR_SELECT} ${CALENDAR_JOINS} WHERE a.id = $1 AND a.company_id = $2`,
      id,
      companyId,
    );
    if (rows.length === 0) throw new NotFoundException('Appointment not found');
    return this.enrichAppointment(companyId, rows[0]);
  }

  async reschedule(companyId: string, appointmentId: string, dto: RescheduleAppointmentDto) {
    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(dto.endsAt);
    if (endsAt < startsAt) throw new BadRequestException('endsAt must not be before startsAt');

    const existing = await this.prisma.tenant.$queryRaw<{ id: string; jobId: string | null }[]>`
      SELECT id, job_id AS "jobId" FROM appointments WHERE id = ${appointmentId}::uuid AND company_id = ${companyId}::uuid
    `;
    if (existing.length === 0) throw new NotFoundException('Appointment not found');

    return this.prisma.withTenantContext(companyId, async (tx) => {
      await tx.$executeRaw`UPDATE appointments SET starts_at = ${startsAt}, ends_at = ${endsAt}, updated_at = now() WHERE id = ${appointmentId}::uuid`;
      if (existing[0].jobId) {
        await tx.$executeRaw`UPDATE jobs SET scheduled_start = ${startsAt}, scheduled_end = ${endsAt}, updated_at = now() WHERE id = ${existing[0].jobId}::uuid`;
      }
      return this.getAppointment(companyId, appointmentId, tx);
    });
  }

  async updateAssignment(companyId: string, appointmentId: string, dto: UpdateAppointmentAssignmentDto) {
    const existing = await this.prisma.tenant.$queryRaw<{ id: string; jobId: string | null }[]>`
      SELECT id, job_id AS "jobId" FROM appointments WHERE id = ${appointmentId}::uuid AND company_id = ${companyId}::uuid
    `;
    if (existing.length === 0) throw new NotFoundException('Appointment not found');

    let assignedCompanyUserId: string | null = null;
    if (dto.assignedUserId) {
      const rows = await this.prisma.tenant.$queryRaw<{ id: string }[]>`
        SELECT id FROM company_users WHERE user_id = ${dto.assignedUserId}::uuid AND company_id = ${companyId}::uuid
      `;
      if (rows.length === 0) throw new ForbiddenException('That user is not a member of this company');
      assignedCompanyUserId = rows[0].id;
    }

    return this.prisma.withTenantContext(companyId, async (tx) => {
      await tx.$executeRaw`
        UPDATE appointments SET
          assigned_to_company_user_id = COALESCE(${assignedCompanyUserId}::uuid, assigned_to_company_user_id),
          arrival_window_minutes = COALESCE(${dto.arrivalWindowMinutes ?? null}, arrival_window_minutes),
          updated_at = now()
        WHERE id = ${appointmentId}::uuid
      `;
      if (existing[0].jobId && dto.assignedUserId) {
        await tx.$executeRaw`UPDATE jobs SET assigned_user_id = ${dto.assignedUserId}::uuid, updated_at = now() WHERE id = ${existing[0].jobId}::uuid`;
      }
      return this.getAppointment(companyId, appointmentId, tx);
    });
  }

  async unschedule(companyId: string, appointmentId: string) {
    const existing = await this.prisma.tenant.$queryRaw<{ id: string; jobId: string | null; appointmentType: string }[]>`
      SELECT id, job_id AS "jobId", appointment_type AS "appointmentType" FROM appointments WHERE id = ${appointmentId}::uuid AND company_id = ${companyId}::uuid
    `;
    if (existing.length === 0) throw new NotFoundException('Appointment not found');

    return this.prisma.withTenantContext(companyId, async (tx) => {
      await tx.$executeRaw`DELETE FROM appointments WHERE id = ${appointmentId}::uuid AND company_id = ${companyId}::uuid`;
      if (existing[0].jobId) {
        // Reverts to draft rather than leaving a job with a status of
        // 'scheduled' but no actual appointment behind it — an
        // inconsistency the old jobs-only design could never produce,
        // but is now possible now that the two are separate records.
        await tx.$executeRaw`
          UPDATE jobs SET scheduled_start = NULL, scheduled_end = NULL,
            status = CASE WHEN status = 'scheduled' THEN 'draft' ELSE status END, updated_at = now()
          WHERE id = ${existing[0].jobId}::uuid
        `;
      }
      return { success: true };
    });
  }

  private async enrichAppointment(companyId: string, row: any) {
    let services: string[] = [];
    if (row.jobId) {
      const items = await this.prisma.tenant.$queryRaw<{ serviceType: string | null; description: string }[]>`
        SELECT service_type AS "serviceType", description FROM job_line_items WHERE job_id = ${row.jobId}::uuid AND company_id = ${companyId}::uuid ORDER BY sort_order ASC
      `;
      services = items.map((i) => i.serviceType ?? i.description);
    }

    const companyRows = await this.prisma.tenant.$queryRaw<{ defaultArrivalWindowMinutes: number | null }[]>`
      SELECT default_arrival_window_minutes AS "defaultArrivalWindowMinutes" FROM companies WHERE id = ${companyId}::uuid
    `;
    const resolvedArrivalWindowMinutes = resolveArrivalWindowMinutes(row.arrivalWindowMinutes, companyRows[0]?.defaultArrivalWindowMinutes);

    return { ...row, services, resolvedArrivalWindowMinutes };
  }
}
