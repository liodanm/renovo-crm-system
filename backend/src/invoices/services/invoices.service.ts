import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { computeDocumentTotals } from '../../common/utils/document-totals.util';
import { UpdateInvoiceDto, QueryInvoicesDto } from '../dto/invoice.dto';

@Injectable()
export class InvoicesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The primary and, for now, only path to a real invoice — a completed
   * Job. A manual "blank invoice, no Job/Estimate" flow is a real,
   * deliberate future addition (invoices.job_id and estimate_id are
   * already nullable, so nothing here blocks it), but it's explicitly
   * out of scope for this pass.
   */
  async generateFromJob(companyId: string, jobId: string, userId: string) {
    const jobRows = await this.prisma.tenant.$queryRaw<
      { id: string; customerId: string; propertyId: string; estimateId: string | null; jobNumber: string; status: string; notes: string | null }[]
    >`
      SELECT id, customer_id AS "customerId", property_id AS "propertyId", estimate_id AS "estimateId",
             job_number AS "jobNumber", status, notes
      FROM jobs WHERE id = ${jobId}::uuid AND company_id = ${companyId}::uuid
    `;
    if (jobRows.length === 0) throw new NotFoundException('Job not found');
    const job = jobRows[0];
    if (job.status !== 'completed') {
      throw new BadRequestException(`Cannot generate an invoice from a job with status '${job.status}' — only completed jobs can be invoiced`);
    }

    return this.prisma.withTenantContext(companyId, async (tx) => {
      const existing = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM invoices WHERE job_id = ${jobId}::uuid AND company_id = ${companyId}::uuid`;
      if (existing.length > 0) return this.findOne(companyId, existing[0].id);

      const lineItems = await tx.$queryRaw<
        { description: string; quantity: string; unitPrice: string; serviceType: string | null; unitOfMeasure: string | null; serviceCatalogItemId: string | null; sortOrder: number }[]
      >`
        SELECT description, quantity, unit_price AS "unitPrice", service_type AS "serviceType",
               unit_of_measure AS "unitOfMeasure", service_catalog_item_id AS "serviceCatalogItemId", sort_order AS "sortOrder"
        FROM job_line_items WHERE job_id = ${jobId}::uuid AND company_id = ${companyId}::uuid ORDER BY sort_order ASC
      `;
      if (lineItems.length === 0) {
        throw new BadRequestException('This job has no line items to invoice');
      }

      const companyRows = await tx.$queryRaw<{ defaultTaxRatePercent: string | null; defaultInvoiceDueDays: number | null }[]>`
        SELECT default_tax_rate_percent AS "defaultTaxRatePercent", default_invoice_due_days AS "defaultInvoiceDueDays"
        FROM companies WHERE id = ${companyId}::uuid
      `;
      const company = companyRows[0];
      const taxRatePercent = company?.defaultTaxRatePercent ? Number(company.defaultTaxRatePercent) : undefined;
      const dueDays = company?.defaultInvoiceDueDays ?? 30; // a real fallback, same reasoning as arrival window's — never left silently unset

      const subtotal = lineItems.reduce((sum, li) => sum + Number(li.quantity) * Number(li.unitPrice), 0);
      const totals = computeDocumentTotals(subtotal, undefined, undefined, taxRatePercent);

      const invoiceNumber = `INV-${Date.now().toString().slice(-6)}`;
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + dueDays);

      const invoiceRows = await tx.$queryRaw<{ id: string }[]>`
        INSERT INTO invoices (
          company_id, customer_id, property_id, job_id, estimate_id, invoice_number, status,
          subtotal, tax_rate, tax_amount, discount_amount, total_amount, due_date, notes, created_by
        ) VALUES (
          ${companyId}::uuid, ${job.customerId}::uuid, ${job.propertyId}::uuid, ${jobId}::uuid, ${job.estimateId}::uuid, ${invoiceNumber}, 'draft',
          ${totals.subtotal}, ${totals.taxRateFraction}, ${totals.taxAmount}, ${totals.discountAmount}, ${totals.totalAmount}, ${dueDate}, ${job.notes}, ${userId}::uuid
        )
        RETURNING id
      `;
      const invoiceId = invoiceRows[0].id;

      for (const li of lineItems) {
        await tx.$executeRaw`
          INSERT INTO invoice_line_items (company_id, invoice_id, description, quantity, unit_price, sort_order, service_type, unit_of_measure, service_catalog_item_id)
          VALUES (${companyId}::uuid, ${invoiceId}::uuid, ${li.description}, ${li.quantity}, ${li.unitPrice}, ${li.sortOrder}, ${li.serviceType}, ${li.unitOfMeasure}, ${li.serviceCatalogItemId}::uuid)
        `;
      }

      return this.findOne(companyId, invoiceId, tx);
    });
  }

  async findAll(companyId: string, query: QueryInvoicesDto) {
    return this.prisma.tenant.$queryRaw`
      SELECT i.id, i.invoice_number AS "invoiceNumber", i.status, i.total_amount AS "totalAmount",
             i.amount_paid AS "amountPaid", i.balance_due AS "balanceDue", i.due_date AS "dueDate",
             i.customer_id AS "customerId", c.first_name AS "customerFirstName", c.last_name AS "customerLastName", c.business_name AS "customerBusinessName"
      FROM invoices i
      JOIN customers c ON c.id = i.customer_id
      WHERE i.company_id = ${companyId}::uuid
        AND (${query.status ?? null}::text IS NULL OR i.status = ${query.status ?? null})
        AND (${query.customerId ?? null}::uuid IS NULL OR i.customer_id = ${query.customerId ?? null}::uuid)
      ORDER BY i.created_at DESC
    `;
  }

  async findOne(companyId: string, id: string, txOverride?: { $queryRaw: any }) {
    const client = txOverride ?? this.prisma.tenant;
    const rows = await client.$queryRaw<any[]>`
      SELECT i.*, i.invoice_number AS "invoiceNumber", i.customer_id AS "customerId", i.property_id AS "propertyId",
             i.job_id AS "jobId", i.estimate_id AS "estimateId", i.discount_type AS "discountType",
             i.discount_amount AS "discountAmount", i.tax_rate AS "taxRate", i.tax_amount AS "taxAmount",
             i.total_amount AS "totalAmount", i.amount_paid AS "amountPaid", i.balance_due AS "balanceDue",
             i.due_date AS "dueDate", i.sent_at AS "sentAt", i.paid_at AS "paidAt", i.created_at AS "createdAt",
             c.first_name AS "customerFirstName", c.last_name AS "customerLastName", c.business_name AS "customerBusinessName",
             c.email AS "customerEmail", c.phone AS "customerPhone",
             p.address_line1 AS "propertyAddressLine1", p.city AS "propertyCity", p.state AS "propertyState",
             j.job_number AS "jobNumber"
      FROM invoices i
      JOIN customers c ON c.id = i.customer_id
      LEFT JOIN properties p ON p.id = i.property_id
      LEFT JOIN jobs j ON j.id = i.job_id
      WHERE i.id = ${id}::uuid AND i.company_id = ${companyId}::uuid
    `;
    if (rows.length === 0) throw new NotFoundException('Invoice not found');
    const invoice = rows[0];

    const lineItems = await client.$queryRaw`
      SELECT id, description, quantity, unit_price AS "unitPrice", total, service_type AS "serviceType",
             unit_of_measure AS "unitOfMeasure", service_catalog_item_id AS "serviceCatalogItemId"
      FROM invoice_line_items WHERE invoice_id = ${id}::uuid AND company_id = ${companyId}::uuid ORDER BY sort_order ASC
    `;

    return { ...invoice, lineItems };
  }

  async update(companyId: string, id: string, dto: UpdateInvoiceDto) {
    const existing = await this.findOne(companyId, id);
    if (existing.status !== 'draft') {
      throw new BadRequestException(`Cannot edit an invoice with status '${existing.status}' — only draft invoices can be edited`);
    }

    const subtotal = Number(existing.subtotal);
    const totals = computeDocumentTotals(
      subtotal,
      dto.discountType ?? existing.discountType,
      dto.discountValue ?? (existing.discountAmount ? Number(existing.discountAmount) : undefined),
      dto.taxRatePercent ?? Number(existing.taxRate) * 100,
    );

    await this.prisma.tenant.$executeRaw`
      UPDATE invoices SET
        due_date = ${dto.dueDate ? new Date(dto.dueDate) : existing.dueDate},
        discount_type = ${dto.discountType ?? existing.discountType},
        discount_amount = ${totals.discountAmount},
        tax_rate = ${totals.taxRateFraction},
        tax_amount = ${totals.taxAmount},
        total_amount = ${totals.totalAmount},
        notes = ${dto.notes ?? existing.notes},
        terms = ${dto.terms ?? existing.terms},
        updated_at = now()
      WHERE id = ${id}::uuid AND company_id = ${companyId}::uuid
    `;
    return this.findOne(companyId, id);
  }

  async send(companyId: string, id: string) {
    const existing = await this.findOne(companyId, id);
    if (existing.status !== 'draft') {
      throw new BadRequestException(`Cannot send an invoice with status '${existing.status}' — only draft invoices can be sent`);
    }
    await this.prisma.tenant.$executeRaw`
      UPDATE invoices SET status = 'sent', sent_at = now(), updated_at = now() WHERE id = ${id}::uuid AND company_id = ${companyId}::uuid
    `;
    return this.findOne(companyId, id);
  }

  async void(companyId: string, id: string) {
    const existing = await this.findOne(companyId, id);
    if (['paid', 'void'].includes(existing.status)) {
      throw new BadRequestException(`Cannot void an invoice with status '${existing.status}'`);
    }
    await this.prisma.tenant.$executeRaw`
      UPDATE invoices SET status = 'void', updated_at = now() WHERE id = ${id}::uuid AND company_id = ${companyId}::uuid
    `;
    return this.findOne(companyId, id);
  }
}
