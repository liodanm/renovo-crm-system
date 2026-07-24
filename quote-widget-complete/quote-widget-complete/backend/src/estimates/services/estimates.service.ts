import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateEstimateDto } from '../dto/create-estimate.dto';
import { UpdateEstimateDto } from '../dto/update-estimate.dto';
import { QueryEstimatesDto } from '../dto/query-estimates.dto';
import { computeEstimateTotals } from './estimate-totals.util';
import { computeLineItemProfit, resolveLaborRate } from './estimate-profit.util';
import { validateServiceDetails } from '../dto/service-details/validate-service-details';
import { JobsService } from '../../jobs/services/jobs.service';
import { PdfService } from '../../documents/services/pdf.service';
import { EmailLogService } from '../../documents/services/email-log.service';
import { CompanyContextService } from '../../documents/services/company-context.service';
import { MailService } from '../../mail/mail.service';
import { ConfigService } from '@nestjs/config';
import { logAutomationEvent } from '../../common/utils/automation-event.util';

// Fields only estimates.profitability holders should ever see — stripped
// from every response otherwise, not just hidden client-side (which
// would still leak the real numbers to anyone reading the network
// response directly).
const PROFITABILITY_LINE_ITEM_FIELDS = [
  'estimatedLaborHours', 'estimatedChemicalCost', 'estimatedEquipmentCost',
  'estimatedFuelCost', 'estimatedMiscCost', 'estimatedProfit', 'profitMarginPercent',
] as const;

@Injectable()
export class EstimatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jobsService: JobsService,
    private readonly pdfService: PdfService,
    private readonly emailLogService: EmailLogService,
    private readonly companyContext: CompanyContextService,
    private readonly mailService: MailService,
    private readonly config: ConfigService,
  ) {}

  async create(companyId: string, dto: CreateEstimateDto, canViewProfitability: boolean) {
    await this.assertCustomerAndPropertyBelongToCompany(companyId, dto.customerId, dto.propertyId);

    const result = await this.prisma.withTenantContext(companyId, async (tx) => {
      const estimateNumber = await this.generateEstimateNumber(tx, companyId);

      const estimate = await tx.estimate.create({
        data: {
          companyId,
          customerId: dto.customerId,
          propertyId: dto.propertyId,
          estimateNumber,
          status: 'draft',
          source: dto.source,
          discountType: dto.discountType,
          notes: dto.notes,
          terms: dto.terms,
          internalNotes: dto.internalNotes,
        },
      });

      await this.insertLineItems(tx, companyId, estimate.id, dto.lineItems);
      await this.computeAndSaveLineItemProfitability(tx, companyId, estimate.id);
      return this.recalculateAndSave(tx, companyId, estimate.id, dto.discountType, dto.discountValue, dto.taxRatePercent);
    });

    return this.applyProfitabilityVisibility(result, canViewProfitability);
  }

  async findAll(companyId: string, query: QueryEstimatesDto) {
    // No profitability gating needed here — this list query never fetches
    // lineItems (only findOne does), so there's nothing for
    // applyProfitabilityVisibility to strip. It previously called that
    // function anyway, which type-checked against this project's local
    // Prisma stub client but was rejected by Railway's real, strict
    // generated types — a call with no actual effect at runtime, removed
    // rather than fought with generics.
    return this.prisma.tenant.estimate.findMany({
      where: {
        companyId,
        status: query.status,
        customerId: query.customerId,
      },
      include: { customer: true, property: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(companyId: string, id: string, canViewProfitability = false) {
    const estimate = await this.prisma.tenant.estimate.findFirst({
      where: { id, companyId },
      include: { customer: true, property: true, lineItems: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!estimate) throw new NotFoundException('Estimate not found');
    return this.applyProfitabilityVisibility(estimate, canViewProfitability);
  }

  async update(companyId: string, id: string, dto: UpdateEstimateDto, canViewProfitability: boolean) {
    // Internal lookup, deliberately not gated by canViewProfitability — this
    // is EstimatesService reading its own data to decide whether editing is
    // even allowed, not a value returned to the caller.
    const existing = await this.findOne(companyId, id, true);
    // Editing is deliberately restricted to drafts: a customer may already
    // be looking at a sent estimate (the portal reads the same row), and
    // silently changing the numbers underneath a sent quote — one they
    // might already be reviewing — is exactly the kind of bug that looks
    // fine in testing and erodes trust in production.
    if (existing.status !== 'draft') {
      throw new BadRequestException(`Cannot edit an estimate with status '${existing.status}' — only draft estimates can be edited`);
    }

    const result = await this.prisma.withTenantContext(companyId, async (tx) => {
      if (dto.lineItems) {
        await tx.estimateLineItem.deleteMany({ where: { estimateId: id, companyId } });
        await this.insertLineItems(tx, companyId, id, dto.lineItems);
        await this.computeAndSaveLineItemProfitability(tx, companyId, id);
      }
      if (dto.notes !== undefined || dto.terms !== undefined) {
        await tx.estimate.update({ where: { id }, data: { notes: dto.notes, terms: dto.terms, internalNotes: dto.internalNotes } });
      }
      return this.recalculateAndSave(tx, companyId, id, dto.discountType ?? existing.discountType ?? undefined, dto.discountValue, dto.taxRatePercent);
    });

    return this.applyProfitabilityVisibility(result, canViewProfitability);
  }

  async send(companyId: string, id: string) {
    const estimate = await this.findOne(companyId, id, true);
    if (estimate.status !== 'draft') {
      throw new BadRequestException(`Cannot send an estimate with status '${estimate.status}' — only draft estimates can be sent`);
    }
    if (estimate.lineItems.length === 0) {
      throw new BadRequestException('Cannot send an estimate with no line items');
    }
    // sentAt is what AutomationService.runEstimateFollowups reads to know
    // when the follow-up clock started — this is the one write in this
    // whole service that automation directly depends on.
    const updated = await this.prisma.tenant.estimate.update({
      where: { id },
      data: { status: 'sent', sentAt: new Date() },
    });
    await this.writeStatusHistory(companyId, id, estimate.status, 'sent', null, 'staff', 'Estimate sent');
    return updated;
  }

  /**
   * The one shared write-path every status-changing method below goes
   * through — mirrors job_status_history's own writeAuditLog helper
   * exactly, not a second pattern for the same idea. source distinguishes
   * *who/what* acted (portal/staff/manual/automation); changedByUserId is
   * only ever set for staff-initiated changes — a portal-driven change
   * has no `users` row to attribute it to.
   */
  private async writeStatusHistory(
    companyId: string,
    estimateId: string,
    fromStatus: string | null,
    toStatus: string,
    changedByUserId: string | null,
    source: 'portal' | 'staff' | 'manual' | 'automation',
    note?: string,
  ) {
    await this.prisma.withTenantContext(companyId, (tx) => tx.$executeRaw`
      INSERT INTO estimate_status_history (company_id, estimate_id, from_status, to_status, changed_by_user_id, source, note)
      VALUES (${companyId}::uuid, ${estimateId}::uuid, ${fromStatus}, ${toStatus}, ${changedByUserId}::uuid, ${source}, ${note ?? null})
    `);
  }

  async getStatusHistory(companyId: string, id: string) {
    await this.findOne(companyId, id, true); // 404s if this isn't the caller's estimate
    return this.prisma.withTenantContext(companyId, (tx) => tx.$queryRaw`
      SELECT h.id, h.from_status AS "fromStatus", h.to_status AS "toStatus", h.source, h.note, h.changed_at AS "changedAt",
             u.first_name AS "userFirstName", u.last_name AS "userLastName"
      FROM estimate_status_history h
      LEFT JOIN users u ON u.id = h.changed_by_user_id
      WHERE h.estimate_id = ${id}::uuid AND h.company_id = ${companyId}::uuid
      ORDER BY h.changed_at ASC
    `);
  }

  /**
   * Staff recording an acceptance that happened outside the portal — a
   * phone call, an in-person signature, an email reply. Duplicate
   * protection: an already-accepted estimate can't be accepted again,
   * same reasoning as every other guard in this file.
   */
  async acceptManually(companyId: string, id: string, userId: string, source: 'staff' | 'manual') {
    const estimate = await this.findOne(companyId, id, true);
    if (estimate.status === 'accepted') throw new BadRequestException('This estimate has already been accepted');
    if (['declined', 'expired'].includes(estimate.status)) {
      throw new BadRequestException(`Cannot accept an estimate with status '${estimate.status}'`);
    }
    const updated = await this.prisma.tenant.estimate.update({
      where: { id },
      data: { status: 'accepted', acceptedAt: new Date(), acceptedVia: source, acceptedByUserId: userId },
    });
    await this.writeStatusHistory(companyId, id, estimate.status, 'accepted', userId, source, `Accepted by ${source === 'staff' ? 'office staff' : 'manual entry'}`);
    await logAutomationEvent(this.prisma, {
      companyId,
      customerId: estimate.customerId,
      ruleType: 'estimate_approved',
      dedupeKey: `estimate-approved-${id}`,
      messageBody: `Estimate ${estimate.estimateNumber} approved (${source})`,
    });

    // Acceptance now automatically creates the Job — this is the one
    // real workflow change: "Convert to Job" used to be a separate,
    // deliberate click; now it's a direct consequence of acceptance,
    // matching how a real pressure-washing business actually thinks
    // about the moment a customer says yes. createFromEstimate's own
    // duplicate guard makes this safe even if something retries.
    const job = await this.jobsService.createFromEstimate(companyId, id);
    await this.writeStatusHistory(companyId, id, 'accepted', 'accepted', userId, source, `Job ${job.jobNumber} created automatically`);

    return updated;
  }

  async declineManually(companyId: string, id: string, userId: string, declineReason: string | undefined, declineComments: string | undefined) {
    const estimate = await this.findOne(companyId, id, true);
    if (estimate.status === 'declined') throw new BadRequestException('This estimate has already been declined');
    if (['accepted', 'expired'].includes(estimate.status)) {
      throw new BadRequestException(`Cannot decline an estimate with status '${estimate.status}'`);
    }
    const updated = await this.prisma.tenant.estimate.update({
      where: { id },
      data: { status: 'declined', declinedAt: new Date(), declineReason: declineReason ?? null, declineComments: declineComments ?? null },
    });
    await this.writeStatusHistory(companyId, id, estimate.status, 'declined', userId, 'staff', declineReason ?? 'Declined by office staff');
    await logAutomationEvent(this.prisma, {
      companyId,
      customerId: estimate.customerId,
      ruleType: 'estimate_declined',
      dedupeKey: `estimate-declined-${id}`,
      messageBody: `Estimate ${estimate.estimateNumber} declined`,
    });
    return updated;
  }

  /**
   * Shared by both the manual staff action and the automatic daily
   * transition (AutomationService.runEstimateExpiration calls this
   * directly) — one status-transition implementation, not two. userId
   * is null for the automatic path, since there's no acting staff
   * member to attribute it to; source records which one actually ran.
   */
  async markExpired(companyId: string, id: string, userId: string | null, source: 'staff' | 'automation' = 'staff') {
    const estimate = await this.findOne(companyId, id, true);
    if (estimate.status === 'expired') throw new BadRequestException('This estimate is already marked expired');
    if (['accepted', 'declined'].includes(estimate.status)) {
      throw new BadRequestException(`Cannot mark an estimate with status '${estimate.status}' as expired`);
    }
    const updated = await this.prisma.tenant.estimate.update({ where: { id }, data: { status: 'expired' } });
    await this.writeStatusHistory(companyId, id, estimate.status, 'expired', userId, source, source === 'automation' ? 'Automatically expired (past valid until date)' : 'Marked expired');
    if (source === 'automation') {
      await logAutomationEvent(this.prisma, {
        companyId,
        customerId: estimate.customerId,
        ruleType: 'estimate_expired',
        dedupeKey: `estimate-expired-${id}`,
        messageBody: `Estimate ${estimate.estimateNumber} automatically expired`,
      });
    }
    return updated;
  }

  /**
   * Admin/owner only (gated by the estimates.reopen permission at the
   * controller) — an accepted estimate that genuinely needs another
   * look becomes editable again rather than requiring a whole new
   * estimate. Duplicate protection: reopening something already in
   * draft is a no-op error, not silently allowed.
   */
  async reopen(companyId: string, id: string, userId: string) {
    const estimate = await this.findOne(companyId, id, true);
    if (estimate.status === 'draft') throw new BadRequestException('This estimate is already a draft');
    const updated = await this.prisma.tenant.estimate.update({
      where: { id },
      data: { status: 'draft', acceptedAt: null, acceptedVia: null, acceptedByUserId: null, declinedAt: null, declineReason: null, declineComments: null },
    });
    await this.writeStatusHistory(companyId, id, estimate.status, 'draft', userId, 'staff', 'Reopened for editing');
    return updated;
  }

  /**
   * Copies customer, property, line items, pricing, tax, notes, terms,
   * and internal notes — never sent/viewed/accepted/declined dates,
   * decline reason/comments, signature, or history, since a duplicate
   * is a genuinely new document, not a continuation of the old one's
   * lifecycle.
   */
  async duplicate(companyId: string, id: string, userId: string) {
    const source = await this.findOne(companyId, id, true);
    const newEstimateNumber = `EST-${Date.now().toString().slice(-6)}`;

    return this.prisma.withTenantContext(companyId, async (tx) => {
      const created = await tx.estimate.create({
        data: {
          companyId,
          customerId: source.customerId,
          propertyId: source.propertyId,
          estimateNumber: newEstimateNumber,
          status: 'draft',
          subtotal: source.subtotal,
          taxRate: source.taxRate,
          taxAmount: source.taxAmount,
          discountAmount: source.discountAmount,
          discountType: source.discountType,
          totalAmount: source.totalAmount,
          notes: source.notes,
          terms: source.terms,
          internalNotes: source.internalNotes,
          createdBy: userId,
        },
      });

      // Reuses the exact same insert path create() already uses — total
      // is a database-generated column (quantity * unit_price), which a
      // typed Prisma .create() call can't correctly omit; insertLineItems
      // already solves this with raw SQL, so this goes through it too
      // rather than a second, broken copy of line-item insertion.
      await this.insertLineItems(
        tx,
        companyId,
        created.id,
        (source.lineItems as any[]).map((li) => ({
          serviceType: li.serviceType,
          description: li.description,
          unitOfMeasure: li.unitOfMeasure,
          quantity: Number(li.quantity),
          unitPrice: Number(li.unitPrice),
          notes: li.notes,
          serviceDetails: li.serviceDetails,
          estimatedLaborHours: li.estimatedLaborHours != null ? Number(li.estimatedLaborHours) : undefined,
          estimatedChemicalCost: li.estimatedChemicalCost != null ? Number(li.estimatedChemicalCost) : undefined,
          estimatedEquipmentCost: li.estimatedEquipmentCost != null ? Number(li.estimatedEquipmentCost) : undefined,
          estimatedFuelCost: li.estimatedFuelCost != null ? Number(li.estimatedFuelCost) : undefined,
          estimatedMiscCost: li.estimatedMiscCost != null ? Number(li.estimatedMiscCost) : undefined,
          serviceCatalogItemId: li.serviceCatalogItemId,
        })),
      );

      await this.writeStatusHistory(companyId, created.id, null, 'draft', userId, 'staff', `Duplicated from ${source.estimateNumber}`);
      return this.findOne(companyId, created.id, true);
    });
  }

  /**
   * The real PDF, generated fresh from live data every time — never
   * stored as a file. An estimate's numbers can still be edited while in
   * draft, and even after sending, the branding/company info it renders
   * with should reflect Settings as they are *right now*, not whatever
   * they were the day this was first sent.
   */
  async generatePdf(companyId: string, id: string): Promise<{ buffer: Buffer; filename: string }> {
    const estimate = await this.findOne(companyId, id, true);
    const { company, branding } = await this.companyContext.getCompanyAndBranding(companyId);

    const buffer = await this.pdfService.generateEstimatePdf({
      estimateNumber: estimate.estimateNumber,
      status: estimate.status,
      issueDate: estimate.createdAt,
      validUntil: estimate.validUntil,
      lineItems: estimate.lineItems.map((li: any) => ({
        description: li.description,
        quantity: Number(li.quantity),
        unitOfMeasure: li.unitOfMeasure,
        unitPrice: Number(li.unitPrice),
        total: Number(li.total),
      })),
      subtotal: Number(estimate.subtotal),
      discountAmount: Number(estimate.discountAmount),
      taxRatePercent: Number(estimate.taxRate) * 100,
      taxAmount: Number(estimate.taxAmount),
      totalAmount: Number(estimate.totalAmount),
      notes: estimate.notes,
      terms: estimate.terms,
      company,
      branding,
      customer: {
        name: estimate.customer.businessName ?? `${estimate.customer.firstName ?? ''} ${estimate.customer.lastName ?? ''}`.trim(),
        email: estimate.customer.email,
        phone: estimate.customer.phone,
      },
      property: {
        addressLine1: estimate.property.addressLine1,
        city: estimate.property.city,
        state: estimate.property.state,
      },
    });

    return { buffer, filename: `Estimate-${estimate.estimateNumber}.pdf` };
  }

  /**
   * The real send/resend path. First send transitions draft -> sent
   * (reusing send() above rather than re-implementing that check);
   * resending an already-sent estimate skips straight to generating and
   * emailing again — a genuinely new email_log row each time, which is
   * exactly what "email history" and "resend" are supposed to produce:
   * a real trail of every attempt, not one row silently overwritten.
   */
  async sendEmail(companyId: string, id: string, userId?: string, toEmailOverride?: string) {
    const existing = await this.findOne(companyId, id, true);
    if (existing.status === 'draft') {
      await this.send(companyId, id);
    } else if (['declined', 'expired'].includes(existing.status)) {
      throw new BadRequestException(`Cannot email an estimate with status '${existing.status}'`);
    }

    const recipientEmail = toEmailOverride || existing.customer.email;
    if (!recipientEmail) throw new BadRequestException('This customer has no email address on file');

    const { buffer, filename } = await this.generatePdf(companyId, id);
    const { company } = await this.companyContext.getCompanyAndBranding(companyId);
    const replyTo = await this.companyContext.getReplyToEmail(companyId);
    const portalUrl = `${this.config.get('auth.frontendUrl') ?? ''}/portal`;

    const emailLogId = await this.emailLogService.create({
      companyId,
      relatedType: 'estimate',
      relatedId: id,
      recipientEmail,
      subject: `Estimate ${existing.estimateNumber} from ${company.dba || company.name}`,
      template: 'estimate-send',
      sentByUserId: userId,
    });

    await this.mailService.sendDocumentEmail({
      to: recipientEmail,
      template: 'estimate-send',
      companyId,
      emailLogId,
      replyTo: replyTo ?? undefined,
      data: {
        customerName: existing.customer.businessName ?? `${existing.customer.firstName ?? ''} ${existing.customer.lastName ?? ''}`.trim(),
        companyName: company.dba || company.name,
        estimateNumber: existing.estimateNumber,
        totalFormatted: `$${Number(existing.totalAmount).toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
        validUntilFormatted: existing.validUntil ? new Date(existing.validUntil).toLocaleDateString('en-US', { dateStyle: 'medium' }) : null,
        portalUrl,
      },
      attachment: { filename, contentBase64: buffer.toString('base64'), contentType: 'application/pdf' },
    });

    return { success: true, emailLogId, recipientEmail };
  }

  async getEmailHistory(companyId: string, id: string) {
    await this.findOne(companyId, id); // 404s if the estimate doesn't exist/isn't this company's
    return this.emailLogService.listForDocument(companyId, 'estimate', id);
  }

  async remove(companyId: string, id: string) {
    const estimate = await this.findOne(companyId, id, true);
    if (estimate.status !== 'draft') {
      throw new BadRequestException(`Cannot delete an estimate with status '${estimate.status}' — only draft estimates can be deleted`);
    }
    await this.prisma.tenant.estimate.delete({ where: { id } });
    return { deleted: true };
  }

  async convertToJob(companyId: string, id: string) {
    // Delegates to JobsService, which now owns Job creation — including
    // real line-item preservation this method never had before. Kept
    // here as the entry point since "Convert to Job" is naturally an
    // estimate-initiated action from the caller's perspective.
    return this.jobsService.createFromEstimate(companyId, id);
  }

  // ===========================================================================
  // Internal helpers
  // ===========================================================================

  private async assertCustomerAndPropertyBelongToCompany(companyId: string, customerId: string, propertyId: string) {
    const property = await this.prisma.tenant.property.findFirst({ where: { id: propertyId, companyId, customerId } });
    if (!property) {
      throw new ForbiddenException('Property does not belong to the specified customer, or either was not found');
    }
  }

  private async generateEstimateNumber(tx: any, companyId: string): Promise<string> {
    const count = await tx.estimate.count({ where: { companyId } });
    return `EST-${(count + 1).toString().padStart(4, '0')}`;
  }

  /**
   * The one place in this service that touches estimate_line_items'
   * INSERT — deliberately raw SQL (Prisma's tagged-template $queryRaw,
   * which auto-parameterizes every value, not string interpolation) since
   * `total` is a Postgres GENERATED ALWAYS column: Postgres rejects any
   * explicit value for it, which is incompatible with Prisma's typed
   * create() API always including every non-omitted field in the column
   * list. Verified directly against live Postgres — an explicit `total`
   * value in the INSERT fails with "cannot insert a non-DEFAULT value into
   * column reserved for GENERATED ALWAYS", and omitting the column
   * entirely (what this does) succeeds and computes the correct value.
   */
  private async insertLineItems(tx: any, companyId: string, estimateId: string, items: CreateEstimateDto['lineItems']) {
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      validateServiceDetails(item.serviceType, item.serviceDetails);

      const serviceDetailsJson = item.serviceDetails ? JSON.stringify(item.serviceDetails) : null;

      await tx.$queryRaw`
        INSERT INTO estimate_line_items
          (company_id, estimate_id, service_type, description, unit_of_measure, quantity, unit_price, notes, sort_order,
           service_details, estimated_labor_hours, estimated_chemical_cost, estimated_equipment_cost, estimated_fuel_cost, estimated_misc_cost, assigned_user_id, service_catalog_item_id)
        VALUES
          (${companyId}::uuid, ${estimateId}::uuid, ${item.serviceType}, ${item.description}, ${item.unitOfMeasure}, ${item.quantity}, ${item.unitPrice}, ${item.notes ?? null}, ${i},
           ${serviceDetailsJson}::jsonb, ${item.estimatedLaborHours ?? 0}, ${item.estimatedChemicalCost ?? 0}, ${item.estimatedEquipmentCost ?? 0}, ${item.estimatedFuelCost ?? 0}, ${item.estimatedMiscCost ?? 0}, ${item.assignedUserId ?? null}::uuid, ${item.serviceCatalogItemId ?? null}::uuid)
      `;
    }
  }

  /**
   * Resolves the applicable labor rate per line item (that line's
   * assignedUserId's rate if one is set, otherwise the company default —
   * see estimate-profit.util.ts for the actual precedence logic) and
   * writes estimated_profit/profit_margin_percent. Runs after every
   * line-item write (create, and any edit that replaces line items) so
   * these numbers are never stale relative to the costs actually stored.
   */
  private async computeAndSaveLineItemProfitability(tx: any, companyId: string, estimateId: string) {
    const company = await tx.company.findUnique({ where: { id: companyId }, select: { defaultLaborRate: true } });
    const defaultLaborRate = Number(company?.defaultLaborRate ?? 0);

    const lineItems: Array<{
      id: string;
      total: unknown;
      estimated_labor_hours: unknown;
      estimated_chemical_cost: unknown;
      estimated_equipment_cost: unknown;
      estimated_fuel_cost: unknown;
      estimated_misc_cost: unknown;
      assigned_user_id: string | null;
    }> = await tx.$queryRaw`
      SELECT id, total, estimated_labor_hours, estimated_chemical_cost, estimated_equipment_cost, estimated_fuel_cost, estimated_misc_cost, assigned_user_id
      FROM estimate_line_items WHERE estimate_id = ${estimateId}::uuid AND company_id = ${companyId}::uuid
    `;

    for (const li of lineItems) {
      let assignedUserRate: number | null = null;
      if (li.assigned_user_id) {
        const user = await tx.user.findUnique({ where: { id: li.assigned_user_id }, select: { hourlyLaborRate: true } });
        assignedUserRate = user?.hourlyLaborRate != null ? Number(user.hourlyLaborRate) : null;
      }

      const { rate } = resolveLaborRate(defaultLaborRate, assignedUserRate);
      const profit = computeLineItemProfit(
        {
          lineTotal: Number(li.total),
          estimatedLaborHours: Number(li.estimated_labor_hours),
          estimatedChemicalCost: Number(li.estimated_chemical_cost),
          estimatedEquipmentCost: Number(li.estimated_equipment_cost),
          estimatedFuelCost: Number(li.estimated_fuel_cost),
          estimatedMiscCost: Number(li.estimated_misc_cost),
        },
        rate,
      );

      await tx.$executeRaw`
        UPDATE estimate_line_items
        SET estimated_profit = ${profit.estimatedProfit}, profit_margin_percent = ${profit.profitMarginPercent}
        WHERE id = ${li.id}::uuid
      `;
    }
  }

  /**
   * The actual enforcement point for "profitability is admin-only, never
   * customer-visible" — strips the cost/profit fields from every line
   * item, and drops the estimate-level aggregate entirely, unless the
   * caller's permission was confirmed by the controller. Applied at the
   * service boundary (every public method's return value passes through
   * this) rather than trusting each call site to remember — the same
   * "no code path where scoping is optional" principle the tenant-context
   * fix used for RLS.
   */
  private applyProfitabilityVisibility<T extends { lineItems?: any[] }>(estimate: T, canViewProfitability: boolean): T {
    if (!estimate.lineItems) return estimate;

    if (!canViewProfitability) {
      return {
        ...estimate,
        lineItems: estimate.lineItems.map((li) => {
          const stripped = { ...li };
          for (const field of PROFITABILITY_LINE_ITEM_FIELDS) delete stripped[field];
          return stripped;
        }),
      };
    }

    // Estimate-level aggregate, only ever computed (and only ever
    // attached to the response) when profitability is already visible —
    // never leaked as a summary figure even when the per-line detail is
    // stripped above.
    const totalRevenue = estimate.lineItems.reduce((sum, li) => sum + Number(li.total), 0);
    const totalEstimatedProfit = estimate.lineItems.reduce((sum, li) => sum + Number(li.estimatedProfit ?? 0), 0);
    const overallProfitMarginPercent = totalRevenue > 0 ? Math.round((totalEstimatedProfit / totalRevenue) * 10000) / 100 : 0;

    return { ...estimate, totalEstimatedProfit: Math.round(totalEstimatedProfit * 100) / 100, overallProfitMarginPercent };
  }

  /**
   * Recomputes subtotal/discount/tax/total from the real, currently-stored
   * line items (never from client-supplied numbers) and saves the result.
   * This is what makes the totals trustworthy: even if a client sent a
   * plausible-looking totalAmount, it's never read — only ever written,
   * always derived server-side from the line items that were actually
   * persisted.
   */
  private async recalculateAndSave(tx: any, companyId: string, estimateId: string, discountType?: string, discountValue?: number, taxRatePercent?: number) {
    const lineItems: Array<{ total: unknown }> = await tx.$queryRaw`
      SELECT total FROM estimate_line_items WHERE estimate_id = ${estimateId}::uuid AND company_id = ${companyId}::uuid
    `;
    const subtotal = lineItems.reduce((sum, li) => sum + Number(li.total), 0);

    const totals = computeEstimateTotals(subtotal, discountType, discountValue, taxRatePercent);

    return tx.estimate.update({
      where: { id: estimateId },
      data: {
        subtotal: totals.subtotal,
        discountType: discountType ?? null,
        discountAmount: totals.discountAmount,
        taxRate: totals.taxRateFraction,
        taxAmount: totals.taxAmount,
        totalAmount: totals.totalAmount,
      },
      include: { lineItems: { orderBy: { sortOrder: 'asc' } }, customer: true, property: true },
    });
  }
}
