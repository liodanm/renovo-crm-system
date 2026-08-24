import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RecordPaymentDto, RefundPaymentDto, VoidPaymentDto } from '../dto/payment.dto';
import { computeInvoiceStatusAfterPayment } from './invoice-status.util';
import { logAutomationEvent } from '../../common/utils/automation-event.util';

const PAYMENT_SELECT = `
  p.id, p.invoice_id AS "invoiceId", p.customer_id AS "customerId", p.property_id AS "propertyId",
  p.amount, p.tip_amount AS "tipAmount", p.processing_fee_amount AS "processingFeeAmount", p.card_type AS "cardType",
  p.method, p.status, p.reference_number AS "referenceNumber", p.notes,
  p.payment_date AS "paymentDate", p.service_date AS "serviceDate", p.processed_at AS "processedAt", p.refunded_amount AS "refundedAmount",
  p.receipt_number AS "receiptNumber", p.created_at AS "createdAt"
`;

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  /**
   * The sole source of truth for the processing fee — the frontend may
   * show a preview, but this is what actually gets stored, computed
   * fresh from the company's current settings every time a payment is
   * recorded. Reads the same companies.settings->'payments' JSONB key
   * Settings already owns (jsonb_set-merge pattern, matching Branding),
   * rather than importing the whole SettingsService — that service
   * isn't exported from SettingsModule, and pulling its full dependency
   * chain into PaymentsModule for one small read would be a bigger,
   * riskier change than this one value warrants.
   *
   * Only ever called for method === 'card' && cardType === 'credit' —
   * every other combination is $0 by construction, not by an extra
   * check here.
   */
  private async calculateProcessingFee(tx: any, companyId: string, amount: number): Promise<number> {
    const rows: { settings: any }[] = await tx.$queryRawUnsafe(
      `SELECT settings FROM companies WHERE id = $1::uuid`,
      companyId,
    );
    const settings = rows[0]?.settings?.payments ?? {};
    if (!settings.processingFeeEnabled) return 0;
    const percent = Number(settings.processingFeePercent ?? 3);
    return Math.round(amount * percent) / 100;
  }

  /**
   * The primary action. balance_due is read fresh from the database's
   * own generated column right before validating — never recomputed
   * here — so this is always checked against the real, current number,
   * not a stale value the caller might be holding.
   */
  async recordPayment(companyId: string, invoiceId: string, userId: string, dto: RecordPaymentDto) {
    const invoiceRows: { id: string; customerId: string; propertyId: string | null; status: string; totalAmount: string; amountPaid: string; balanceDue: string; invoiceNumber: string }[] =
      await this.prisma.withTenantContext(companyId, (tx) => tx.$queryRaw`
      SELECT id, customer_id AS "customerId", property_id AS "propertyId", status,
             total_amount AS "totalAmount", amount_paid AS "amountPaid", balance_due AS "balanceDue", invoice_number AS "invoiceNumber"
      FROM invoices WHERE id = ${invoiceId}::uuid AND company_id = ${companyId}::uuid
    `);
    if (invoiceRows.length === 0) throw new NotFoundException('Invoice not found');
    const invoice = invoiceRows[0];

    if (['draft', 'void'].includes(invoice.status)) {
      throw new BadRequestException(`Cannot record a payment against an invoice with status '${invoice.status}'`);
    }
    const balanceDue = Number(invoice.balanceDue);
    if (dto.amount > balanceDue + 0.01) {
      // Deliberately rejected, not clamped — there's no Credits concept
      // yet for the excess to go to (explicitly deferred), so silently
      // accepting an overpayment would create money the system has
      // nowhere correct to put.
      throw new BadRequestException(`Payment of $${dto.amount.toFixed(2)} exceeds the balance due of $${balanceDue.toFixed(2)}`);
    }

    return this.prisma.withTenantContext(companyId, async (tx) => {
      const receiptNumber = `RCPT-${Date.now().toString().slice(-6)}`;
      // Only credit card carries a fee, by construction — debit and
      // every non-card method are $0 without a separate check, since
      // the fee helper is simply never called for them.
      const processingFeeAmount = dto.method === 'card' && dto.cardType === 'credit'
        ? await this.calculateProcessingFee(tx, companyId, dto.amount)
        : 0;
      // tip_amount/processing_fee_amount are stored here and nowhere
      // else touches them — the invoice/LTV updates below continue to
      // read only dto.amount, exactly as before either field existed.
      const paymentRows = await tx.$queryRaw<{ id: string }[]>`
        INSERT INTO payments (company_id, invoice_id, customer_id, property_id, amount, tip_amount, processing_fee_amount, card_type, method, status, reference_number, notes, payment_date, service_date, processed_at, receipt_number)
        VALUES (${companyId}::uuid, ${invoiceId}::uuid, ${invoice.customerId}::uuid, ${invoice.propertyId}::uuid, ${dto.amount}, ${dto.tipAmount ?? 0}, ${processingFeeAmount}, ${dto.cardType ?? null}, ${dto.method}, 'succeeded',
                ${dto.referenceNumber ?? null}, ${dto.notes ?? null}, ${dto.paymentDate ? new Date(dto.paymentDate) : new Date()},
                ${dto.serviceDate ? new Date(dto.serviceDate) : null}, now(), ${receiptNumber})
        RETURNING id
      `;
      const paymentId = paymentRows[0].id;
      await tx.$executeRaw`
        INSERT INTO payment_status_history (company_id, payment_id, from_status, to_status, changed_by_user_id, note)
        VALUES (${companyId}::uuid, ${paymentId}::uuid, NULL, 'succeeded', ${userId}::uuid, 'Payment recorded')
      `;

      const newAmountPaid = Number(invoice.amountPaid) + dto.amount;
      const newStatus = computeInvoiceStatusAfterPayment(Number(invoice.totalAmount), newAmountPaid, invoice.status);
      await tx.$executeRaw`
        UPDATE invoices SET amount_paid = ${newAmountPaid}, status = ${newStatus},
          paid_at = ${newStatus === 'paid' ? new Date() : null}, updated_at = now()
        WHERE id = ${invoiceId}::uuid AND company_id = ${companyId}::uuid
      `;
      // Same transaction, same amount already applied to the invoice
      // above — propagated to the customer record, not recalculated.
      await tx.$executeRaw`
        UPDATE customers SET lifetime_value = lifetime_value + ${dto.amount}
        WHERE id = ${invoice.customerId}::uuid AND company_id = ${companyId}::uuid
      `;

      if (newStatus === 'paid') {
        // Fires regardless of how the invoice reached "paid" — cash,
        // check, Zelle recorded here, or the separate Stripe webhook
        // path in PortalController — "Invoice Paid" is a real event
        // about the invoice's state, not specific to one payment method.
        // Deliberately called with the outer PrismaService (not tx) —
        // it opens its own withTenantContext transaction, a fire-and-
        // forget side effect independent of this payment's own
        // transaction, matching the try/catch-and-continue design
        // inside logAutomationEvent itself.
        await logAutomationEvent(this.prisma, {
          companyId,
          customerId: invoice.customerId,
          ruleType: 'invoice_paid',
          dedupeKey: `invoice-paid-${invoiceId}`,
          messageBody: `Invoice ${invoice.invoiceNumber} paid in full via ${dto.method}`,
        });
      }

      return this.findOne(companyId, paymentId, tx);
    });
  }

  /**
   * A payment received from a customer with no invoice involved at
   * all — e.g. historical work completed before this CRM existed, with
   * no invoice ever created for it. Deliberately does NOT reuse
   * recordPayment()'s invoice-status gate or balance-due cap — neither
   * rule has any meaning here, there is no invoice to be draft/void and
   * no balance to overpay. What IS reused: the exact same INSERT shape,
   * the same payment_status_history entry, and the same LTV-increment
   * pattern (amount only, tip excluded) — the only two differences are
   * invoice_id is NULL and no invoices/customers-amountPaid update runs.
   */
  async recordStandalonePayment(companyId: string, customerId: string, userId: string, dto: RecordPaymentDto) {
    const customerRows: { id: string }[] = await this.prisma.withTenantContext(companyId, (tx) => tx.$queryRaw`
      SELECT id FROM customers WHERE id = ${customerId}::uuid AND company_id = ${companyId}::uuid
    `);
    if (customerRows.length === 0) throw new NotFoundException('Customer not found');

    return this.prisma.withTenantContext(companyId, async (tx) => {
      const receiptNumber = `RCPT-${Date.now().toString().slice(-6)}`;
      const processingFeeAmount = dto.method === 'card' && dto.cardType === 'credit'
        ? await this.calculateProcessingFee(tx, companyId, dto.amount)
        : 0;
      const paymentRows = await tx.$queryRaw<{ id: string }[]>`
        INSERT INTO payments (company_id, invoice_id, customer_id, property_id, amount, tip_amount, processing_fee_amount, card_type, method, status, reference_number, notes, payment_date, service_date, processed_at, receipt_number)
        VALUES (${companyId}::uuid, NULL, ${customerId}::uuid, NULL, ${dto.amount}, ${dto.tipAmount ?? 0}, ${processingFeeAmount}, ${dto.cardType ?? null}, ${dto.method}, 'succeeded',
                ${dto.referenceNumber ?? null}, ${dto.notes ?? null}, ${dto.paymentDate ? new Date(dto.paymentDate) : new Date()},
                ${dto.serviceDate ? new Date(dto.serviceDate) : null}, now(), ${receiptNumber})
        RETURNING id
      `;
      const paymentId = paymentRows[0].id;
      await tx.$executeRaw`
        INSERT INTO payment_status_history (company_id, payment_id, from_status, to_status, changed_by_user_id, note)
        VALUES (${companyId}::uuid, ${paymentId}::uuid, NULL, 'succeeded', ${userId}::uuid, 'Standalone payment recorded (no invoice)')
      `;

      // Identical to recordPayment's own LTV update — dto.amount only,
      // tip excluded, same as the invoice-payment path.
      await tx.$executeRaw`
        UPDATE customers SET lifetime_value = lifetime_value + ${dto.amount}
        WHERE id = ${customerId}::uuid AND company_id = ${companyId}::uuid
      `;

      return this.findOne(companyId, paymentId, tx);
    });
  }

  /**
   * Company-wide payment list — added during the cross-module audit,
   * which found the nav pointed to a Payments page that never actually
   * existed; only per-invoice listing (listByInvoice) had been built.
   * Joins through to invoice_number and customer name, matching the
   * same enrichment pattern findAll already uses everywhere else
   * (Jobs, Invoices, Scheduling's calendar).
   */
  async findAll(companyId: string, status?: string) {
    // Same reasoning as Invoices/Jobs — a safety net, not a contract change.
    return this.prisma.withTenantContext(companyId, (tx) =>
      tx.$queryRawUnsafe(
        `SELECT ${PAYMENT_SELECT}, i.invoice_number AS "invoiceNumber",
              c.first_name AS "customerFirstName", c.last_name AS "customerLastName", c.business_name AS "customerBusinessName"
       FROM payments p
       LEFT JOIN invoices i ON i.id = p.invoice_id
       JOIN customers c ON c.id = p.customer_id
       WHERE p.company_id = $1::uuid AND ($2::text IS NULL OR p.status = $2)
       ORDER BY p.created_at DESC
       LIMIT 200`,
        companyId,
        status ?? null,
      ),
    );
  }

  async listByInvoice(companyId: string, invoiceId: string) {
    return this.prisma.withTenantContext(companyId, (tx) =>
      tx.$queryRawUnsafe(`SELECT ${PAYMENT_SELECT} FROM payments p WHERE p.invoice_id = $1::uuid AND p.company_id = $2::uuid ORDER BY p.created_at ASC`, invoiceId, companyId),
    );
  }

  async findOne(companyId: string, id: string, txOverride?: { $queryRawUnsafe: (q: string, ...v: any[]) => Promise<any> }) {
    const run = (client: { $queryRawUnsafe: any }) => client.$queryRawUnsafe(`SELECT ${PAYMENT_SELECT} FROM payments p WHERE p.id = $1::uuid AND p.company_id = $2::uuid`, id, companyId);
    const rows: any[] = txOverride ? await run(txOverride) : await this.prisma.withTenantContext(companyId, (tx) => run(tx));
    if (rows.length === 0) throw new NotFoundException('Payment not found');
    return rows[0];
  }

  async voidPayment(companyId: string, id: string, userId: string, dto: VoidPaymentDto) {
    const payment = await this.findOne(companyId, id);
    if (['void', 'refunded'].includes(payment.status)) {
      throw new BadRequestException(`Cannot void a payment with status '${payment.status}'`);
    }

    return this.prisma.withTenantContext(companyId, async (tx) => {
      await tx.$executeRaw`UPDATE payments SET status = 'void', updated_at = now() WHERE id = ${id}::uuid AND company_id = ${companyId}::uuid`;
      await tx.$executeRaw`
        INSERT INTO payment_status_history (company_id, payment_id, from_status, to_status, changed_by_user_id, note)
        VALUES (${companyId}::uuid, ${id}::uuid, ${payment.status}, 'void', ${userId}::uuid, ${dto.note ?? null})
      `;
      await this.reverseAmountFromInvoice(tx, companyId, payment.invoiceId, payment.customerId, Number(payment.amount));
      return this.findOne(companyId, id, tx);
    });
  }

  async refundPayment(companyId: string, id: string, userId: string, dto: RefundPaymentDto) {
    const payment = await this.findOne(companyId, id);
    if (payment.status !== 'succeeded' && payment.status !== 'partially_refunded') {
      throw new BadRequestException(`Cannot refund a payment with status '${payment.status}'`);
    }
    const alreadyRefunded = Number(payment.refundedAmount);
    const refundableAmount = Number(payment.amount) - alreadyRefunded;
    const refundAmount = dto.amount ?? refundableAmount;
    if (refundAmount > refundableAmount + 0.01) {
      throw new BadRequestException(`Cannot refund $${refundAmount.toFixed(2)} — only $${refundableAmount.toFixed(2)} of this payment remains refundable`);
    }

    return this.prisma.withTenantContext(companyId, async (tx) => {
      const newRefundedAmount = alreadyRefunded + refundAmount;
      const newStatus = newRefundedAmount >= Number(payment.amount) - 0.01 ? 'refunded' : 'partially_refunded';
      await tx.$executeRaw`
        UPDATE payments SET status = ${newStatus}, refunded_amount = ${newRefundedAmount}, updated_at = now()
        WHERE id = ${id}::uuid AND company_id = ${companyId}::uuid
      `;
      await tx.$executeRaw`
        INSERT INTO payment_status_history (company_id, payment_id, from_status, to_status, changed_by_user_id, note)
        VALUES (${companyId}::uuid, ${id}::uuid, ${payment.status}, ${newStatus}, ${userId}::uuid, ${dto.note ?? null})
      `;
      await this.reverseAmountFromInvoice(tx, companyId, payment.invoiceId, payment.customerId, refundAmount);
      return this.findOne(companyId, id, tx);
    });
  }

  /** Shared by void and refund — both remove money from the invoice's amount_paid and let the same status-recompute logic decide what happens next. Also reverses the same amount from the customer's lifetimeValue, since a voided or refunded payment shouldn't keep counting as money collected — one shared reversal path for both callers, not two. */
  /**
   * Reverses what recordPayment (or recordStandalonePayment) applied on
   * void/refund. When invoiceId is present, this is the exact existing
   * behavior — unchanged. When it's null (a standalone payment), there
   * is no invoice balance to reverse, but the customer's LTV was still
   * incremented at recording time and must still be undone — using
   * customerId directly off the payment itself, since there's no
   * invoice row here to read it from.
   */
  private async reverseAmountFromInvoice(tx: any, companyId: string, invoiceId: string | null, customerId: string, amount: number) {
    if (!invoiceId) {
      await tx.$executeRaw`
        UPDATE customers SET lifetime_value = GREATEST(0, lifetime_value - ${amount})
        WHERE id = ${customerId}::uuid AND company_id = ${companyId}::uuid
      `;
      return;
    }

    const invoiceRows = await tx.$queryRaw<{ customerId: string; status: string; totalAmount: string; amountPaid: string }[]>`
      SELECT customer_id AS "customerId", status, total_amount AS "totalAmount", amount_paid AS "amountPaid" FROM invoices WHERE id = ${invoiceId}::uuid AND company_id = ${companyId}::uuid
    `;
    const invoice = invoiceRows[0];
    const newAmountPaid = Math.max(0, Number(invoice.amountPaid) - amount);
    const newStatus = computeInvoiceStatusAfterPayment(Number(invoice.totalAmount), newAmountPaid, invoice.status);
    await tx.$executeRaw`
      UPDATE invoices SET amount_paid = ${newAmountPaid}, status = ${newStatus},
        paid_at = ${newStatus === 'paid' ? new Date() : null}, updated_at = now()
      WHERE id = ${invoiceId}::uuid AND company_id = ${companyId}::uuid
    `;
    // GREATEST(0, ...) as a safety floor — a customer-facing number
    // should never go negative even in an edge-case sequencing, the
    // same defensive instinct as Math.max(0, ...) on amountPaid above.
    await tx.$executeRaw`
      UPDATE customers SET lifetime_value = GREATEST(0, lifetime_value - ${amount})
      WHERE id = ${invoice.customerId}::uuid AND company_id = ${companyId}::uuid
    `;
  }

  /**
   * The receipt architecture, per explicit instruction: a composed,
   * read-only view built at request time from the payment plus its
   * invoice, customer, property, and company/branding settings — never
   * a second stored copy of any of that data. No PDF here; this is the
   * structured data a future PDF/email/portal view would all render
   * from identically.
   */
  async getReceipt(companyId: string, paymentId: string) {
    const rows: any[] = await this.prisma.withTenantContext(companyId, (tx) =>
      tx.$queryRawUnsafe(
        `SELECT p.id, p.receipt_number AS "receiptNumber", p.amount, p.tip_amount AS "tipAmount", p.processing_fee_amount AS "processingFeeAmount", p.card_type AS "cardType", p.method, p.status,
              p.reference_number AS "referenceNumber", p.payment_date AS "paymentDate", p.notes,
              i.invoice_number AS "invoiceNumber", i.total_amount AS "invoiceTotal", i.balance_due AS "invoiceBalanceDue",
              c.first_name AS "customerFirstName", c.last_name AS "customerLastName", c.business_name AS "customerBusinessName", c.email AS "customerEmail",
              pr.address_line1 AS "propertyAddressLine1", pr.city AS "propertyCity", pr.state AS "propertyState",
              co.name AS "companyName", co.dba AS "companyDba", co.logo_url AS "companyLogoUrl", co.phone AS "companyPhone",
              co.email AS "companyEmail", co.address_line1 AS "companyAddressLine1", co.city AS "companyCity", co.state AS "companyState",
              co.settings AS "companySettings", co.google_review_url AS "googleReviewUrl"
       FROM payments p
       LEFT JOIN invoices i ON i.id = p.invoice_id
       JOIN customers c ON c.id = p.customer_id
       LEFT JOIN properties pr ON pr.id = p.property_id
       JOIN companies co ON co.id = p.company_id
       WHERE p.id = $1::uuid AND p.company_id = $2::uuid`,
        paymentId,
        companyId,
      ),
    );
    if (rows.length === 0) throw new NotFoundException('Payment not found');
    const row = rows[0];
    const branding = row.companySettings?.branding ?? {};
    // google_review_url (the raw column, still selected above for
    // backward compatibility) was found in audit to have no write path
    // anywhere in the app — it is always null. The real, writable value
    // now lives in companies.settings.integrations, set from
    // Settings > Integrations > Google Review URL.
    const links = row.companySettings?.integrations ?? {};
    return {
      ...row,
      googleReviewUrl: links.googleReviewUrl ?? row.googleReviewUrl ?? null,
      branding: {
        logoUrl: branding.logoUrl ?? row.companyLogoUrl,
        primaryColor: branding.primaryColor ?? null,
        footerMessage: branding.footerMessage ?? null,
      },
    };
  }
}
