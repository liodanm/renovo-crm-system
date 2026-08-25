import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';

/**
 * Owner-only permanent data deletion for test-data cleanup. Every method
 * here:
 *   1. Runs inside a single database transaction — either everything
 *      described in the Phase 1 audit's approved deletion chain
 *      succeeds, or nothing does.
 *   2. Never calls Stripe, or anything network-facing at all — this is
 *      strictly local-row deletion. stripePaymentIntentId/stripeChargeId
 *      on a deleted Payment are just local text columns describing
 *      history; nothing here ever reads them to make an API call.
 *   3. Writes exactly one data_deletion_log row, success or failure,
 *      matching the approved audit-log design — that table has
 *      deliberately no foreign key to the entity described, since the
 *      whole point is for the audit record to survive the deletion.
 */
@Injectable()
export class AdminDataService {
  constructor(private readonly prisma: PrismaService) {}

  async previewEstimateDeletion(companyId: string, id: string) {
    return this.prisma.withTenantContext(companyId, async (tx) => {
      const estimate = await tx.estimate.findFirst({ where: { id, companyId } });
      if (!estimate) throw new NotFoundException('Estimate not found');
      const invoices = await tx.invoice.findMany({ where: { estimateId: id, companyId }, select: { id: true } });
      const invoiceIds = invoices.map((i) => i.id);
      const paymentCount = invoiceIds.length
        ? await tx.payment.count({ where: { invoiceId: { in: invoiceIds }, companyId } })
        : 0;
      return { invoiceCount: invoiceIds.length, paymentCount };
    });
  }

  async previewJobDeletion(companyId: string, id: string) {
    return this.prisma.withTenantContext(companyId, async (tx) => {
      const job = await tx.job.findFirst({ where: { id, companyId } });
      if (!job) throw new NotFoundException('Job not found');
      const invoices = await tx.invoice.findMany({ where: { jobId: id, companyId }, select: { id: true } });
      const invoiceIds = invoices.map((i) => i.id);
      const paymentCount = invoiceIds.length
        ? await tx.payment.count({ where: { invoiceId: { in: invoiceIds }, companyId } })
        : 0;
      const appointmentRows: { count: string }[] = await tx.$queryRawUnsafe(
        `SELECT COUNT(*)::text AS count FROM appointments WHERE job_id = $1::uuid AND company_id = $2::uuid`,
        id,
        companyId,
      );
      return { invoiceCount: invoiceIds.length, paymentCount, appointmentCount: Number(appointmentRows[0]?.count ?? 0) };
    });
  }

  async previewInvoiceDeletion(companyId: string, id: string) {
    return this.prisma.withTenantContext(companyId, async (tx) => {
      const invoice = await tx.invoice.findFirst({ where: { id, companyId } });
      if (!invoice) throw new NotFoundException('Invoice not found');
      const paymentCount = await tx.payment.count({ where: { invoiceId: id, companyId } });
      return { paymentCount };
    });
  }

  async deleteEstimate(companyId: string, id: string, userId: string) {
    try {
      const result = await this.prisma.withTenantContext(companyId, async (tx) => {
        const estimate = await tx.estimate.findFirst({ where: { id, companyId } });
        if (!estimate) throw new NotFoundException('Estimate not found');

        // Deletion chain per the approved architecture: Invoice(s) ->
        // their Payments -> Estimate itself. EstimateLineItems and
        // estimate_status_history both have a real ON DELETE CASCADE
        // (verified directly against the migration SQL during the
        // audit), so deleting the Estimate row itself is sufficient for
        // those — no explicit step needed.
        const invoices = await tx.invoice.findMany({ where: { estimateId: id, companyId }, select: { id: true } });
        const invoiceIds = invoices.map((i) => i.id);
        let deletedPaymentIds: string[] = [];
        if (invoiceIds.length > 0) {
          // Payment already has a real ON DELETE CASCADE from Invoice
          // (verified in the schema) — deleting the Invoices below would
          // remove these automatically. Deleted explicitly first anyway
          // so the exact IDs can be recorded in the audit log's metadata.
          const payments = await tx.payment.findMany({ where: { invoiceId: { in: invoiceIds }, companyId }, select: { id: true } });
          deletedPaymentIds = payments.map((p) => p.id);
          await tx.payment.deleteMany({ where: { invoiceId: { in: invoiceIds }, companyId } });
          await tx.invoice.deleteMany({ where: { id: { in: invoiceIds }, companyId } });
        }

        await tx.estimate.delete({ where: { id } });

        // Same class of bug found and fixed in deletePayment() below —
        // this method can remove Payment rows too (via the invoice
        // cascade above), and left uncorrected would leave the
        // customer's cached lifetime_value stale in exactly the same
        // way. Only recalculates when a payment actually existed to
        // remove, avoiding an unnecessary write on the common case.
        if (deletedPaymentIds.length > 0) {
          const [{ total }] = await tx.$queryRaw<{ total: string }[]>`
            SELECT COALESCE(SUM(amount - refunded_amount), 0) AS total
            FROM payments
            WHERE customer_id = ${estimate.customerId}::uuid
              AND status IN ('succeeded', 'partially_refunded', 'refunded')
          `;
          await tx.customer.update({ where: { id: estimate.customerId }, data: { lifetimeValue: Number(total) } });
        }

        return { deletedInvoiceIds: invoiceIds, deletedPaymentIds };
      });

      await this.writeLog(companyId, userId, 'estimate', id, true, undefined, result);
      return { deleted: true, ...result };
    } catch (err) {
      await this.writeLog(companyId, userId, 'estimate', id, false, (err as Error).message);
      throw err;
    }
  }

  async deleteJob(companyId: string, id: string, userId: string) {
    try {
      const result = await this.prisma.withTenantContext(companyId, async (tx) => {
        const job = await tx.job.findFirst({ where: { id, companyId } });
        if (!job) throw new NotFoundException('Job not found');

        const invoices = await tx.invoice.findMany({ where: { jobId: id, companyId }, select: { id: true } });
        const invoiceIds = invoices.map((i) => i.id);
        let deletedPaymentIds: string[] = [];
        if (invoiceIds.length > 0) {
          const payments = await tx.payment.findMany({ where: { invoiceId: { in: invoiceIds }, companyId }, select: { id: true } });
          deletedPaymentIds = payments.map((p) => p.id);
          await tx.payment.deleteMany({ where: { invoiceId: { in: invoiceIds }, companyId } });
          await tx.invoice.deleteMany({ where: { id: { in: invoiceIds }, companyId } });
        }

        // Defensive, explicit appointment deletion. The Phase 1 audit
        // could NOT locate appointments' original CREATE TABLE
        // statement anywhere in this repo checkout, so its actual
        // ON DELETE behavior toward jobs is unverified. This explicit
        // delete is safe either way: if a cascade already exists, this
        // just removes 0 extra rows; if the FK is RESTRICT (Postgres's
        // default when unspecified), this is what prevents the Job
        // delete below from failing. Do not remove this step without
        // first confirming appointments' real FK definition against the
        // live database.
        const appointmentRows: { id: string }[] = await tx.$queryRawUnsafe(
          `SELECT id FROM appointments WHERE job_id = $1::uuid AND company_id = $2::uuid`,
          id,
          companyId,
        );
        const deletedAppointmentIds = appointmentRows.map((a) => a.id);
        if (deletedAppointmentIds.length > 0) {
          await tx.$executeRawUnsafe(`DELETE FROM appointments WHERE job_id = $1::uuid AND company_id = $2::uuid`, id, companyId);
        }

        // JobLineItem, JobStatusHistory, JobChemicalUsage,
        // JobEquipmentUsage, JobAuditLog, Photo, Document all have a
        // real ON DELETE CASCADE from Job (verified directly against
        // schema.prisma during the audit) — deleting the Job row itself
        // is sufficient for all of these, no explicit steps needed.
        await tx.job.delete({ where: { id } });

        // Same lifetime_value staleness bug found and fixed across
        // every delete method in this file — see deletePayment()'s own
        // comment for the full reasoning.
        if (deletedPaymentIds.length > 0) {
          const [{ total }] = await tx.$queryRaw<{ total: string }[]>`
            SELECT COALESCE(SUM(amount - refunded_amount), 0) AS total
            FROM payments
            WHERE customer_id = ${job.customerId}::uuid
              AND status IN ('succeeded', 'partially_refunded', 'refunded')
          `;
          await tx.customer.update({ where: { id: job.customerId }, data: { lifetimeValue: Number(total) } });
        }

        return { deletedInvoiceIds: invoiceIds, deletedPaymentIds, deletedAppointmentIds };
      });

      await this.writeLog(companyId, userId, 'job', id, true, undefined, result);
      return { deleted: true, ...result };
    } catch (err) {
      await this.writeLog(companyId, userId, 'job', id, false, (err as Error).message);
      throw err;
    }
  }

  async deleteInvoice(companyId: string, id: string, userId: string) {
    try {
      const result = await this.prisma.withTenantContext(companyId, async (tx) => {
        const invoice = await tx.invoice.findFirst({ where: { id, companyId } });
        if (!invoice) throw new NotFoundException('Invoice not found');

        // Payment and InvoiceLineItem both have a real ON DELETE CASCADE
        // from Invoice (verified in schema.prisma) — deleting the
        // Invoice row itself is sufficient for both.
        const payments = await tx.payment.findMany({ where: { invoiceId: id, companyId }, select: { id: true } });
        const deletedPaymentIds = payments.map((p) => p.id);

        await tx.invoice.delete({ where: { id } });

        // Same lifetime_value staleness bug found and fixed across
        // every delete method in this file — see deletePayment()'s own
        // comment for the full reasoning.
        if (deletedPaymentIds.length > 0) {
          const [{ total }] = await tx.$queryRaw<{ total: string }[]>`
            SELECT COALESCE(SUM(amount - refunded_amount), 0) AS total
            FROM payments
            WHERE customer_id = ${invoice.customerId}::uuid
              AND status IN ('succeeded', 'partially_refunded', 'refunded')
          `;
          await tx.customer.update({ where: { id: invoice.customerId }, data: { lifetimeValue: Number(total) } });
        }

        return { deletedPaymentIds };
      });

      await this.writeLog(companyId, userId, 'invoice', id, true, undefined, result);
      return { deleted: true, ...result };
    } catch (err) {
      await this.writeLog(companyId, userId, 'invoice', id, false, (err as Error).message);
      throw err;
    }
  }

  async deletePayment(companyId: string, id: string, userId: string) {
    try {
      await this.prisma.withTenantContext(companyId, async (tx) => {
        const payment = await tx.payment.findFirst({ where: { id, companyId } });
        if (!payment) throw new NotFoundException('Payment not found');
        // payment_status_history has a real ON DELETE CASCADE from
        // payments (verified in the migration SQL) — no explicit step
        // needed. Deliberately no Stripe call anywhere in this method —
        // stripePaymentIntentId/stripeChargeId are read nowhere here.
        await tx.payment.delete({ where: { id } });

        // Real bug found and fixed here: this method deleted the
        // payment row but never touched customers.lifetime_value,
        // unlike every other payment-affecting path in this codebase
        // (recordPayment, void, refund, merge). Left uncorrected, the
        // customer's cached lifetime value silently drifts upward every
        // time an admin deletes a payment through this tool — exactly
        // what happened in production (a customer's LTV stayed at the
        // old total after their test payments were removed here).
        // Recalculates from the same SUM(amount - refunded_amount)
        // WHERE status IN ('succeeded','partially_refunded','refunded')
        // formula already proven correct in CustomersService.merge() —
        // not a new, independently-invented calculation.
        const [{ total }] = await tx.$queryRaw<{ total: string }[]>`
          SELECT COALESCE(SUM(amount - refunded_amount), 0) AS total
          FROM payments
          WHERE customer_id = ${payment.customerId}::uuid
            AND status IN ('succeeded', 'partially_refunded', 'refunded')
        `;
        await tx.customer.update({ where: { id: payment.customerId }, data: { lifetimeValue: Number(total) } });
      });

      await this.writeLog(companyId, userId, 'payment', id, true);
      return { deleted: true };
    } catch (err) {
      await this.writeLog(companyId, userId, 'payment', id, false, (err as Error).message);
      throw err;
    }
  }

  /**
   * Writes one data_deletion_log row, success or failure. Deliberately
   * NOT inside the same transaction as the deletion itself — a rolled-
   * back deletion transaction must not also roll back its own failure
   * log entry, or a failed attempt would leave zero trace of having
   * been attempted at all.
   */
  private async writeLog(
    companyId: string,
    userId: string,
    entityType: 'estimate' | 'job' | 'invoice' | 'payment',
    entityId: string,
    succeeded: boolean,
    errorMessage?: string,
    metadata?: unknown,
  ) {
    await this.prisma.withTenantContext(companyId, async (tx) => {
      await tx.$executeRawUnsafe(
        `INSERT INTO data_deletion_log (company_id, performed_by_user_id, entity_type, entity_id, succeeded, error_message, metadata)
         VALUES ($1::uuid, $2::uuid, $3, $4::uuid, $5, $6, $7::jsonb)`,
        companyId,
        userId,
        entityType,
        entityId,
        succeeded,
        errorMessage ?? null,
        metadata ? JSON.stringify(metadata) : null,
      );
    });
  }
}
