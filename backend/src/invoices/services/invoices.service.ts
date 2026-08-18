import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/prisma/prisma.service';
import { computeDocumentTotals } from '../../common/utils/document-totals.util';
import { generateInvoiceFilename } from '../../common/utils/pdf-filename.util';
import { UpdateInvoiceDto, QueryInvoicesDto } from '../dto/invoice.dto';
import { PdfService } from '../../documents/services/pdf.service';
import { EmailLogService } from '../../documents/services/email-log.service';
import { CompanyContextService } from '../../documents/services/company-context.service';
import { MailService } from '../../mail/mail.service';
import { PortalAuthService } from '../../portal/services/portal-auth.service';

@Injectable()
export class InvoicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pdfService: PdfService,
    private readonly emailLogService: EmailLogService,
    private readonly companyContext: CompanyContextService,
    private readonly mailService: MailService,
    private readonly portalAuthService: PortalAuthService,
    private readonly config: ConfigService,
  ) {}

  /**
   * The primary and, for now, only path to a real invoice — a completed
   * Job. A manual "blank invoice, no Job/Estimate" flow is a real,
   * deliberate future addition (invoices.job_id and estimate_id are
   * already nullable, so nothing here blocks it), but it's explicitly
   * out of scope for this pass.
   */
  async generateFromJob(companyId: string, jobId: string, userId: string) {
    const jobRows: { id: string; customerId: string; propertyId: string; estimateId: string | null; jobNumber: string; status: string; notes: string | null }[] =
      await this.prisma.withTenantContext(companyId, (tx) => tx.$queryRaw`
      SELECT id, customer_id AS "customerId", property_id AS "propertyId", estimate_id AS "estimateId",
             job_number AS "jobNumber", status, notes
      FROM jobs WHERE id = ${jobId}::uuid AND company_id = ${companyId}::uuid
    `);
    if (jobRows.length === 0) throw new NotFoundException('Job not found');
    const job = jobRows[0];
    if (job.status !== 'completed') {
      throw new BadRequestException(`Cannot generate an invoice from a job with status '${job.status}' — only completed jobs can be invoiced`);
    }

    return this.prisma.withTenantContext(companyId, async (tx) => {
      const existing = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM invoices WHERE job_id = ${jobId}::uuid AND company_id = ${companyId}::uuid`;
      if (existing.length > 0) return this.findOne(companyId, existing[0].id);

      const lineItems = await tx.$queryRaw<
        { description: string; quantity: string; unitPrice: string; serviceType: string | null; customServiceName: string | null; unitOfMeasure: string | null; serviceCatalogItemId: string | null; sortOrder: number }[]
      >`
        SELECT description, quantity, unit_price AS "unitPrice", service_type AS "serviceType", custom_service_name AS "customServiceName",
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
      const dueDays = company?.defaultInvoiceDueDays ?? 30; // a real fallback, same reasoning as arrival window's — never left silently unset

      // Snapshot the source estimate's already-finalized values directly
      // — never recalculate them — the same "snapshot, don't regenerate"
      // pattern already proven correct by EstimateService.duplicate().
      // Every genuinely financial field on Estimate is copied verbatim;
      // amountPaid/balanceDue are deliberately not touched here at all,
      // since neither is a snapshot question — a brand-new invoice has
      // simply never been paid yet, regardless of estimate history.
      //
      // Falls back to today's exact recompute-from-line-items behavior
      // when there's no source estimate at all (e.g. a job the AI
      // Receptionist created directly) — that path is unchanged, not
      // just preserved by accident.
      let totals: { subtotal: number; discountAmount: number; discountType: string | null; discountSource: string | null; taxAmount: number; totalAmount: number; taxRateFraction: number };
      if (job.estimateId) {
        const estimateRows = await tx.$queryRaw<
          { subtotal: string; discountAmount: string; discountType: string | null; discountSource: string | null; taxRate: string; taxAmount: string; totalAmount: string }[]
        >`
          SELECT subtotal, discount_amount AS "discountAmount", discount_type AS "discountType", discount_source AS "discountSource", tax_rate AS "taxRate", tax_amount AS "taxAmount", total_amount AS "totalAmount"
          FROM estimates WHERE id = ${job.estimateId}::uuid AND company_id = ${companyId}::uuid
        `;
        const estimate = estimateRows[0];
        totals = {
          subtotal: Number(estimate.subtotal),
          discountAmount: Number(estimate.discountAmount),
          discountType: estimate.discountType,
          discountSource: estimate.discountSource,
          taxAmount: Number(estimate.taxAmount),
          totalAmount: Number(estimate.totalAmount),
          taxRateFraction: Number(estimate.taxRate),
        };
      } else {
        const taxRatePercent = company?.defaultTaxRatePercent ? Number(company.defaultTaxRatePercent) : undefined;
        const subtotal = lineItems.reduce((sum, li) => sum + Number(li.quantity) * Number(li.unitPrice), 0);
        const computed = computeDocumentTotals(subtotal, undefined, undefined, taxRatePercent);
        totals = { ...computed, discountType: null, discountSource: null };
      }

      const invoiceNumber = `INV-${Date.now().toString().slice(-6)}`;
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + dueDays);

      const invoiceRows = await tx.$queryRaw<{ id: string }[]>`
        INSERT INTO invoices (
          company_id, customer_id, property_id, job_id, estimate_id, invoice_number, status,
          subtotal, tax_rate, tax_amount, discount_amount, discount_type, discount_source, total_amount, due_date, notes, created_by
        ) VALUES (
          ${companyId}::uuid, ${job.customerId}::uuid, ${job.propertyId}::uuid, ${jobId}::uuid, ${job.estimateId}::uuid, ${invoiceNumber}, 'draft',
          ${totals.subtotal}, ${totals.taxRateFraction}, ${totals.taxAmount}, ${totals.discountAmount}, ${totals.discountType}, ${totals.discountSource}, ${totals.totalAmount}, ${dueDate}, ${job.notes}, ${userId}::uuid
        )
        RETURNING id
      `;
      const invoiceId = invoiceRows[0].id;

      for (const li of lineItems) {
        await tx.$executeRaw`
          INSERT INTO invoice_line_items (company_id, invoice_id, description, quantity, unit_price, sort_order, service_type, custom_service_name, unit_of_measure, service_catalog_item_id)
          VALUES (${companyId}::uuid, ${invoiceId}::uuid, ${li.description}, ${li.quantity}, ${li.unitPrice}, ${li.sortOrder}, ${li.serviceType}, ${li.customServiceName}, ${li.unitOfMeasure}, ${li.serviceCatalogItemId}::uuid)
        `;
      }

      return this.findOne(companyId, invoiceId, tx);
    });
  }

  async findAll(companyId: string, query: QueryInvoicesDto) {
    // A LIMIT here, not full pagination — Customers already has real
    // page/pageSize pagination and the frontend contract for that list
    // is built around it; Invoices' list has always returned a plain
    // array, and changing that shape is a real frontend contract change
    // beyond what a hardening pass should force through. This caps
    // unbounded growth (a company with thousands of invoices returning
    // all of them in one response) without changing what callers get
    // back today — genuine pagination here is real follow-up work.
    return this.prisma.withTenantContext(companyId, (tx) => tx.$queryRaw`
      SELECT i.id, i.invoice_number AS "invoiceNumber", i.status, i.total_amount AS "totalAmount",
             i.amount_paid AS "amountPaid", i.balance_due AS "balanceDue", i.due_date AS "dueDate",
             i.customer_id AS "customerId", c.first_name AS "customerFirstName", c.last_name AS "customerLastName", c.business_name AS "customerBusinessName"
      FROM invoices i
      JOIN customers c ON c.id = i.customer_id
      WHERE i.company_id = ${companyId}::uuid
        AND (${query.status ?? null}::text IS NULL OR i.status = ${query.status ?? null})
        AND (${query.customerId ?? null}::uuid IS NULL OR i.customer_id = ${query.customerId ?? null}::uuid)
      ORDER BY i.created_at DESC
      LIMIT 200
    `);
  }

  async findOne(companyId: string, id: string, txOverride?: { $queryRaw: any }) {
    const run = async (client: { $queryRaw: any }) => {
      const rows = await client.$queryRaw<any[]>`
        SELECT i.*, i.invoice_number AS "invoiceNumber", i.customer_id AS "customerId", i.property_id AS "propertyId",
               i.job_id AS "jobId", i.estimate_id AS "estimateId", i.discount_type AS "discountType",
               i.discount_amount AS "discountAmount", i.discount_source AS "discountSource", i.tax_rate AS "taxRate", i.tax_amount AS "taxAmount",
               i.total_amount AS "totalAmount", i.amount_paid AS "amountPaid", i.balance_due AS "balanceDue",
               i.due_date AS "dueDate", i.sent_at AS "sentAt", i.viewed_at AS "viewedAt", i.paid_at AS "paidAt", i.created_at AS "createdAt",
               c.first_name AS "customerFirstName", c.last_name AS "customerLastName", c.business_name AS "customerBusinessName",
               c.email AS "customerEmail", c.phone AS "customerPhone",
               p.address_line1 AS "propertyAddressLine1", p.city AS "propertyCity", p.state AS "propertyState",
               j.job_number AS "jobNumber",
               e.estimate_number AS "sourceEstimateNumber"
        FROM invoices i
        JOIN customers c ON c.id = i.customer_id
        LEFT JOIN properties p ON p.id = i.property_id
        LEFT JOIN jobs j ON j.id = i.job_id
        LEFT JOIN estimates e ON e.id = i.estimate_id
        WHERE i.id = ${id}::uuid AND i.company_id = ${companyId}::uuid
      `;
      if (rows.length === 0) throw new NotFoundException('Invoice not found');
      const invoice = rows[0];

      const lineItems = await client.$queryRaw`
        SELECT id, description, quantity, unit_price AS "unitPrice", total, service_type AS "serviceType", custom_service_name AS "customServiceName",
               unit_of_measure AS "unitOfMeasure", service_catalog_item_id AS "serviceCatalogItemId"
        FROM invoice_line_items WHERE invoice_id = ${id}::uuid AND company_id = ${companyId}::uuid ORDER BY sort_order ASC
      `;

      return { ...invoice, lineItems };
    };

    // Real, pre-existing bug fixed here: raw $queryRaw calls are never
    // covered by the tenant-context Prisma extension (that only wraps
    // model operations like .findMany/.create) — without this explicit
    // withTenantContext wrap, every call site that doesn't already run
    // inside its own transaction (send, void, and now PDF generation)
    // would silently return zero rows against a real, non-superuser
    // production database with RLS enforced. Only skipped when a
    // txOverride is passed in, since that caller's own withTenantContext
    // transaction already set the session variable.
    if (txOverride) return run(txOverride);
    return this.prisma.withTenantContext(companyId, run);
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

    await this.prisma.withTenantContext(companyId, (tx) => tx.$executeRaw`
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
    `);
    return this.findOne(companyId, id);
  }

  async send(companyId: string, id: string) {
    const existing = await this.findOne(companyId, id);
    if (existing.status !== 'draft') {
      throw new BadRequestException(`Cannot send an invoice with status '${existing.status}' — only draft invoices can be sent`);
    }
    await this.prisma.withTenantContext(companyId, (tx) => tx.$executeRaw`
      UPDATE invoices SET status = 'sent', sent_at = now(), updated_at = now() WHERE id = ${id}::uuid AND company_id = ${companyId}::uuid
    `);
    return this.findOne(companyId, id);
  }

  /**
   * The real PDF, generated fresh from live data — mirrors
   * EstimatesService.generatePdf exactly, including the reasoning:
   * branding/company info should always reflect Settings as they are
   * right now, never a stored snapshot from whenever this was first sent.
   */
  async generatePdf(companyId: string, id: string): Promise<{ buffer: Buffer; filename: string }> {
    const invoice = await this.findOne(companyId, id);
    const { company, branding } = await this.companyContext.getCompanyAndBranding(companyId);
    // Was: `${this.config.get('auth.frontendUrl') ?? ''}/portal` — the
    // STAFF app's host, same root cause as the email link below. Fixed to
    // the correct portal host here too (not an auto-login magic link like
    // the email gets — this URL is baked into the PDF itself, a document
    // that can be saved/printed/reopened weeks later, well past any
    // short-lived token's TTL, so a plain, durable portal URL is the
    // correct choice for this specific context).
    const portalUrl = this.config.get<string>('PORTAL_URL', 'https://portal.renovocrm.com');

    const buffer = await this.pdfService.generateInvoicePdf({
      invoiceNumber: invoice.invoiceNumber,
      status: invoice.status,
      issueDate: invoice.createdAt,
      dueDate: invoice.dueDate,
      lineItems: invoice.lineItems.map((li: any) => ({
        description: li.description,
        serviceType: li.serviceType,
        customServiceName: li.customServiceName,
        quantity: Number(li.quantity),
        unitOfMeasure: li.unitOfMeasure,
        unitPrice: Number(li.unitPrice),
        total: Number(li.total),
      })),
      subtotal: Number(invoice.subtotal),
      discountAmount: Number(invoice.discountAmount),
      discountSource: invoice.discountSource ?? null,
      discountType: invoice.discountType ?? null,
      taxRatePercent: Number(invoice.taxRate) * 100,
      taxAmount: Number(invoice.taxAmount),
      totalAmount: Number(invoice.totalAmount),
      amountPaid: Number(invoice.amountPaid),
      balanceDue: Number(invoice.balanceDue),
      notes: invoice.notes,
      terms: invoice.terms,
      paymentLinkUrl: Number(invoice.balanceDue) > 0 ? portalUrl : null,
      company,
      branding,
      customer: {
        name: invoice.customerBusinessName ?? `${invoice.customerFirstName ?? ''} ${invoice.customerLastName ?? ''}`.trim(),
        email: invoice.customerEmail,
        phone: invoice.customerPhone,
      },
      property: {
        addressLine1: invoice.propertyAddressLine1,
        city: invoice.propertyCity,
        state: invoice.propertyState,
      },
    });

    return { buffer, filename: generateInvoiceFilename(invoice.invoiceNumber, invoice.sourceEstimateNumber ?? null) };
  }

  /**
   * First send transitions draft -> sent (reusing send() above rather
   * than re-implementing the status check); resending an already-sent
   * invoice skips straight to generating and emailing again — a
   * genuinely new email_log row each time, same reasoning as Estimates.
   */
  async sendEmail(companyId: string, id: string, userId: string, toEmailOverride?: string) {
    const existing = await this.findOne(companyId, id);
    if (existing.status === 'draft') {
      await this.send(companyId, id);
    } else if (existing.status === 'void') {
      throw new BadRequestException('Cannot email a voided invoice');
    }

    const recipientEmail = toEmailOverride || existing.customerEmail;
    if (!recipientEmail) throw new BadRequestException('This customer has no email address on file');

    const { company, branding } = await this.companyContext.getCompanyAndBranding(companyId);
    const replyTo = await this.companyContext.getReplyToEmail(companyId);
    // Deep-links straight to the specific invoice, same pattern as the
    // estimate email fix — redirectTo carries the customer past the
    // generic portal dashboard directly onto /portal/invoices/{id}.
    const portalUrl = await this.portalAuthService.generatePortalLink(companyId, existing.customerId, `/portal/invoices/${id}`)
      ?? this.config.get<string>('PORTAL_URL', 'https://portal.renovocrm.com');

    const emailLogId = await this.emailLogService.create({
      companyId,
      relatedType: 'invoice',
      relatedId: id,
      recipientEmail,
      subject: `Your Invoice Is Ready – ${existing.invoiceNumber}`,
      template: 'invoice-send',
      sentByUserId: userId,
    });

    const property = existing.property ?? existing.job?.property ?? null;

    await this.mailService.sendDocumentEmail({
      to: recipientEmail,
      template: 'invoice-send',
      companyId,
      emailLogId,
      replyTo: replyTo ?? undefined,
      data: {
        // Deliberately no total/balanceDue or any other pricing field —
        // the customer email must never expose the amount before the
        // customer clicks through to the authenticated portal, same
        // rule already applied to the estimate email.
        customerFirstName: existing.customerFirstName || existing.customerBusinessName || 'there',
        companyName: company.dba || company.name,
        invoiceNumber: existing.invoiceNumber,
        portalUrl,
        brandColor: branding.primaryColor,
      },
      // No PDF attachment — the customer reviews and pays directly in
      // the portal now. The PDF is still fully available there via the
      // existing "Download Invoice PDF" button, using the same
      // PdfService this method used to attach from here — not removed,
      // just no longer generated eagerly on every send.
    });

    // Internal "Invoice Sent" notification — only fires after the
    // customer email above has actually been accepted by sendDocumentEmail
    // (which itself only enqueues after emailLogService.create() and the
    // recipient/eligibility checks earlier in this method have already
    // passed). Best-effort and isolated in its own try/catch so a
    // notification failure can never fail — or even be attributed to — the
    // customer's own successful send.
    try {
      const to = replyTo;
      if (to) {
        const customerName = existing.customerBusinessName ?? `${existing.customerFirstName ?? ''} ${existing.customerLastName ?? ''}`.trim();
        const staffUrl = `${this.config.get('auth.frontendUrl') ?? ''}/invoices/${id}`;
        await this.mailService.sendInvoiceSentNotification(to, {
          customerName,
          customerEmail: recipientEmail,
          invoiceNumber: existing.invoiceNumber,
          totalFormatted: `$${Number(existing.totalAmount).toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
          propertyAddress: property ? `${property.addressLine1}, ${property.city}, ${property.state} ${(property as any).postalCode ?? ''}`.trim() : null,
          invoiceUrl: staffUrl,
        });
      }
    } catch {
      // Logged implicitly via MailService.enqueue()'s own catch/log —
      // never rethrown here, never allowed to affect the response below.
    }

    return { success: true, emailLogId, recipientEmail };
  }

  async getEmailHistory(companyId: string, id: string) {
    await this.findOne(companyId, id); // 404s if the invoice doesn't exist/isn't this company's
    return this.emailLogService.listForDocument(companyId, 'invoice', id);
  }

  async void(companyId: string, id: string) {
    const existing = await this.findOne(companyId, id);
    if (['paid', 'void'].includes(existing.status)) {
      throw new BadRequestException(`Cannot void an invoice with status '${existing.status}'`);
    }

    // A 'partial' invoice can have real, uncanceled payment money attached
    // to it (status 'succeeded' or 'partially_refunded') — voiding it here
    // without checking would leave the invoice saying "void / nothing
    // owed" while a payment record on it still says money was collected.
    // This never reverses or touches a payment itself; it only requires
    // the existing, already-working payment-level Void/Refund actions
    // (PaymentsService.voidPayment / refundPayment — both already surfaced
    // in the UI right on this invoice's page) be used first. Once every
    // payment is refunded or voided, amount_paid returns to 0 and
    // computeInvoiceStatusAfterPayment already reverts the invoice's own
    // status to 'sent' — at that point this check passes on its own, no
    // special-casing needed.
    const activePayments: { id: string }[] = await this.prisma.withTenantContext(companyId, (tx) => tx.$queryRaw`
      SELECT id FROM payments
      WHERE invoice_id = ${id}::uuid AND company_id = ${companyId}::uuid AND status IN ('succeeded', 'partially_refunded')
    `);
    if (activePayments.length > 0) {
      throw new BadRequestException(
        'Cannot void an invoice with active payments — void or fully refund the existing payment(s) first.',
      );
    }

    await this.prisma.withTenantContext(companyId, (tx) => tx.$executeRaw`
      UPDATE invoices SET status = 'void', updated_at = now() WHERE id = ${id}::uuid AND company_id = ${companyId}::uuid
    `);
    return this.findOne(companyId, id);
  }
}
