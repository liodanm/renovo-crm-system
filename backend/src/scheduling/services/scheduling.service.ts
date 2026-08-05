import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ScheduleJobDto, RescheduleAppointmentDto, UpdateAppointmentAssignmentDto, QueryCalendarDto } from '../dto/scheduling.dto';
import { resolveArrivalWindowMinutes } from './arrival-window.util';

const CALENDAR_SELECT = `
  a.id, a.appointment_type AS "appointmentType", a.starts_at AS "startsAt", a.ends_at AS "endsAt",
  a.all_day AS "allDay", a.status, a.arrival_window_minutes AS "arrivalWindowMinutes",
  a.job_id AS "jobId", a.estimate_id AS "estimateId", a.title, a.cancellation_reason AS "cancellationReason",
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
   * The one and only conflict rule: same technician, overlapping time.
   * Unassigned appointments never conflict (no shared resource). Only
   * 'scheduled'/'confirmed' appointments block — 'cancelled' freed the
   * time, 'no_show' never occupied it, 'completed' already happened and
   * carries no future double-booking risk. Strict overlap (< / >, not
   * <= / >=) so back-to-back appointments are never flagged. Shared by
   * every create/update path below rather than duplicated per call site.
   */
  private async assertNoTechnicianConflict(
    tx: any,
    companyId: string,
    assignedCompanyUserId: string | null,
    startsAt: Date,
    endsAt: Date,
    excludeAppointmentId: string | null,
  ) {
    if (!assignedCompanyUserId) return;

    const conflicts: { id: string; title: string; startsAt: Date; endsAt: Date }[] = await tx.$queryRaw`
      SELECT id, title, starts_at AS "startsAt", ends_at AS "endsAt"
      FROM appointments
      WHERE company_id = ${companyId}::uuid
        AND assigned_to_company_user_id = ${assignedCompanyUserId}::uuid
        AND status IN ('scheduled', 'confirmed')
        AND (${excludeAppointmentId}::uuid IS NULL OR id != ${excludeAppointmentId}::uuid)
        AND starts_at < ${endsAt}
        AND ends_at > ${startsAt}
      LIMIT 1
    `;
    if (conflicts.length > 0) {
      const c = conflicts[0];
      const fmt = (d: Date) => new Date(d).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
      throw new BadRequestException(
        `This technician is already booked for "${c.title}" from ${fmt(c.startsAt)} to ${fmt(c.endsAt)} — reschedule one of them first.`,
      );
    }
  }

  /**
   * The one and only path that puts a date on a job. Writes the
   * appointment first (the real source of truth per the approved
   * architecture), then syncs jobs.scheduled_start/scheduled_end as a
   * denormalized convenience field — never the other way around.
   */
  async scheduleJob(companyId: string, jobId: string, userId: string, dto: ScheduleJobDto) {
    const jobRows: { id: string; customerId: string; propertyId: string; title: string; status: string }[] =
      await this.prisma.withTenantContext(companyId, (tx) => tx.$queryRaw`SELECT id, customer_id AS "customerId", property_id AS "propertyId", title, status FROM jobs WHERE id = ${jobId}::uuid AND company_id = ${companyId}::uuid`);
    if (jobRows.length === 0) throw new NotFoundException('Job not found');
    const job = jobRows[0];

    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(dto.endsAt);
    if (endsAt < startsAt) throw new BadRequestException('endsAt must not be before startsAt');

    if (dto.assignedUserId) {
      const belongs: { id: string }[] = await this.prisma.withTenantContext(companyId, (tx) => tx.$queryRaw`
        SELECT id FROM company_users WHERE user_id = ${dto.assignedUserId}::uuid AND company_id = ${companyId}::uuid
      `);
      if (belongs.length === 0) throw new ForbiddenException('That user is not a member of this company');
    }

    return this.prisma.withTenantContext(companyId, async (tx) => {
      const assignedCompanyUserRows = dto.assignedUserId
        ? await tx.$queryRaw<{ id: string }[]>`SELECT id FROM company_users WHERE user_id = ${dto.assignedUserId}::uuid AND company_id = ${companyId}::uuid`
        : [];
      const assignedCompanyUserId = assignedCompanyUserRows[0]?.id ?? null;

      const existing = await tx.$queryRaw<{ id: string; assignedToCompanyUserId: string | null }[]>`
        SELECT id, assigned_to_company_user_id AS "assignedToCompanyUserId" FROM appointments WHERE job_id = ${jobId}::uuid AND company_id = ${companyId}::uuid
      `;

      // Auto-assign-to-self applies only to a job's *first* scheduling
      // (no prior appointment exists) — never to a reschedule of an
      // already-assigned appointment, which must keep whoever it was
      // assigned to unless someone explicitly changes it. Solo owner
      // today, this distinction is invisible (it's always the same
      // person either way); it's the one thing that keeps this correct
      // once a second technician exists.
      const autoAssignCompanyUserId =
        !dto.assignedUserId && existing.length === 0
          ? (await tx.$queryRaw<{ id: string }[]>`SELECT id FROM company_users WHERE user_id = ${userId}::uuid AND company_id = ${companyId}::uuid`)[0]?.id ?? null
          : null;
      const insertAssignedCompanyUserId = assignedCompanyUserId ?? autoAssignCompanyUserId;

      // The effective technician for this write: the newly-supplied one if
      // given, otherwise whatever the appointment (if any) already had —
      // matching the same COALESCE semantics the actual UPDATE below uses,
      // so the conflict check is validating the assignment that will
      // actually end up stored, not just what was passed in this call.
      const effectiveAssignedCompanyUserId = assignedCompanyUserId ?? existing[0]?.assignedToCompanyUserId ?? insertAssignedCompanyUserId ?? null;
      await this.assertNoTechnicianConflict(tx, companyId, effectiveAssignedCompanyUserId, startsAt, endsAt, existing[0]?.id ?? null);

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
          VALUES (${companyId}::uuid, 'job', ${jobId}::uuid, ${job.customerId}::uuid, ${job.propertyId}::uuid, ${job.title}, ${startsAt}, ${endsAt}, ${dto.arrivalWindowMinutes ?? null}, ${insertAssignedCompanyUserId}::uuid, 'scheduled')
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

    const rows: any[] = await this.prisma.withTenantContext(companyId, (tx) =>
      tx.$queryRawUnsafe(
        `SELECT ${CALENDAR_SELECT} ${CALENDAR_JOINS}
       WHERE a.company_id = $1::uuid AND a.starts_at < $2 AND a.ends_at >= $3
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
      ),
    );

    return Promise.all(rows.map((r) => this.enrichAppointment(companyId, r)));
  }

  async getAppointment(companyId: string, id: string, txOverride?: { $queryRawUnsafe: (query: string, ...values: any[]) => Promise<any> }) {
    const run = (client: { $queryRawUnsafe: any }) =>
      client.$queryRawUnsafe(`SELECT ${CALENDAR_SELECT} ${CALENDAR_JOINS} WHERE a.id = $1::uuid AND a.company_id = $2::uuid`, id, companyId);
    const rows: any[] = txOverride ? await run(txOverride) : await this.prisma.withTenantContext(companyId, (tx) => run(tx));
    if (rows.length === 0) throw new NotFoundException('Appointment not found');
    return this.enrichAppointment(companyId, rows[0]);
  }

  async reschedule(companyId: string, appointmentId: string, dto: RescheduleAppointmentDto) {
    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(dto.endsAt);
    if (endsAt < startsAt) throw new BadRequestException('endsAt must not be before startsAt');

    const existing: { id: string; jobId: string | null; assignedToCompanyUserId: string | null }[] = await this.prisma.withTenantContext(companyId, (tx) => tx.$queryRaw`
      SELECT id, job_id AS "jobId", assigned_to_company_user_id AS "assignedToCompanyUserId" FROM appointments WHERE id = ${appointmentId}::uuid AND company_id = ${companyId}::uuid
    `);
    if (existing.length === 0) throw new NotFoundException('Appointment not found');

    return this.prisma.withTenantContext(companyId, async (tx) => {
      await this.assertNoTechnicianConflict(tx, companyId, existing[0].assignedToCompanyUserId, startsAt, endsAt, appointmentId);
      await tx.$executeRaw`UPDATE appointments SET starts_at = ${startsAt}, ends_at = ${endsAt}, updated_at = now() WHERE id = ${appointmentId}::uuid`;
      if (existing[0].jobId) {
        await tx.$executeRaw`UPDATE jobs SET scheduled_start = ${startsAt}, scheduled_end = ${endsAt}, updated_at = now() WHERE id = ${existing[0].jobId}::uuid`;
      }
      return this.getAppointment(companyId, appointmentId, tx);
    });
  }

  async updateAssignment(companyId: string, appointmentId: string, dto: UpdateAppointmentAssignmentDto) {
    const existing: { id: string; jobId: string | null; startsAt: Date; endsAt: Date }[] = await this.prisma.withTenantContext(companyId, (tx) => tx.$queryRaw`
      SELECT id, job_id AS "jobId", starts_at AS "startsAt", ends_at AS "endsAt" FROM appointments WHERE id = ${appointmentId}::uuid AND company_id = ${companyId}::uuid
    `);
    if (existing.length === 0) throw new NotFoundException('Appointment not found');

    let assignedCompanyUserId: string | null = null;
    if (dto.assignedUserId) {
      const rows: { id: string }[] = await this.prisma.withTenantContext(companyId, (tx) => tx.$queryRaw`
        SELECT id FROM company_users WHERE user_id = ${dto.assignedUserId}::uuid AND company_id = ${companyId}::uuid
      `);
      if (rows.length === 0) throw new ForbiddenException('That user is not a member of this company');
      assignedCompanyUserId = rows[0].id;
    }

    return this.prisma.withTenantContext(companyId, async (tx) => {
      // Only a real assignment change can introduce a new conflict — an
      // arrival-window-only update touches neither the technician nor the
      // time, so there's nothing new to check.
      if (assignedCompanyUserId) {
        await this.assertNoTechnicianConflict(tx, companyId, assignedCompanyUserId, existing[0].startsAt, existing[0].endsAt, appointmentId);
      }
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
    const existing: { id: string; jobId: string | null; appointmentType: string }[] = await this.prisma.withTenantContext(companyId, (tx) => tx.$queryRaw`
      SELECT id, job_id AS "jobId", appointment_type AS "appointmentType" FROM appointments WHERE id = ${appointmentId}::uuid AND company_id = ${companyId}::uuid
    `);
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

  /**
   * Cancels an appointment (status -> 'cancelled', reason recorded) without
   * deleting it — unlike unschedule() above, which removes the row
   * entirely. A cancelled appointment stays queryable/visible on the
   * calendar (already rendered distinctly — APPOINTMENT_STATUS_COLORS has
   * had a 'cancelled' entry since before this method existed) and in
   * appointment_status_history, preserving the record of what was
   * scheduled and why it didn't happen, rather than erasing it.
   *
   * Never touches a completed appointment or a completed job's data —
   * both explicitly guarded below, not just incidentally avoided. The
   * job-side-effect on a 'scheduled' job is intentionally identical to
   * unschedule()'s: revert to draft, clear the schedule — the same
   * "needs a new appointment" outcome, just via a preserved-history path
   * instead of a deleted one.
   */
  async cancel(companyId: string, appointmentId: string, userId: string, reason?: string) {
    const existing: { id: string; jobId: string | null; status: string; jobStatus: string | null }[] = await this.prisma.withTenantContext(companyId, (tx) => tx.$queryRaw`
      SELECT a.id, a.job_id AS "jobId", a.status, j.status AS "jobStatus"
      FROM appointments a
      LEFT JOIN jobs j ON j.id = a.job_id
      WHERE a.id = ${appointmentId}::uuid AND a.company_id = ${companyId}::uuid
    `);
    if (existing.length === 0) throw new NotFoundException('Appointment not found');
    const appt = existing[0];

    if (appt.status === 'cancelled') throw new BadRequestException('This appointment is already cancelled');
    if (appt.status === 'completed') throw new BadRequestException('Cannot cancel a completed appointment');
    if (appt.jobStatus === 'completed') throw new BadRequestException('Cannot cancel an appointment for a completed job');

    return this.prisma.withTenantContext(companyId, async (tx) => {
      await tx.$executeRaw`
        UPDATE appointments SET status = 'cancelled', cancellation_reason = ${reason ?? null}, updated_at = now()
        WHERE id = ${appointmentId}::uuid AND company_id = ${companyId}::uuid
      `;
      await tx.$executeRaw`
        INSERT INTO appointment_status_history (company_id, appointment_id, from_status, to_status, changed_by_user_id, note)
        VALUES (${companyId}::uuid, ${appointmentId}::uuid, ${appt.status}, 'cancelled', ${userId}::uuid, ${reason ?? null})
      `;

      if (appt.jobId) {
        await tx.$executeRaw`
          UPDATE jobs SET scheduled_start = NULL, scheduled_end = NULL,
            status = CASE WHEN status = 'scheduled' THEN 'draft' ELSE status END, updated_at = now()
          WHERE id = ${appt.jobId}::uuid
        `;
      }

      return this.getAppointment(companyId, appointmentId, tx);
    });
  }

  private async enrichAppointment(companyId: string, row: any) {
    let services: string[] = [];
    if (row.jobId) {
      const items: { serviceType: string | null; description: string }[] = await this.prisma.withTenantContext(companyId, (tx) => tx.$queryRaw`
        SELECT service_type AS "serviceType", description FROM job_line_items WHERE job_id = ${row.jobId}::uuid AND company_id = ${companyId}::uuid ORDER BY sort_order ASC
      `);
      services = items.map((i) => i.serviceType ?? i.description);
    }

    // companies is not RLS-scoped by company_id (it's the tenant root
    // itself, exempt the same way `User` is) — this one genuinely
    // doesn't need withTenantContext, unlike job_line_items above.
    const companyRows = await this.prisma.tenant.$queryRaw<{ defaultArrivalWindowMinutes: number | null }[]>`
      SELECT default_arrival_window_minutes AS "defaultArrivalWindowMinutes" FROM companies WHERE id = ${companyId}::uuid
    `;
    const resolvedArrivalWindowMinutes = resolveArrivalWindowMinutes(row.arrivalWindowMinutes, companyRows[0]?.defaultArrivalWindowMinutes);

    return { ...row, services, resolvedArrivalWindowMinutes };
  }
}
