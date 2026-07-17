import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateEstimateDto } from '../dto/create-estimate.dto';
import { UpdateEstimateDto } from '../dto/update-estimate.dto';
import { QueryEstimatesDto } from '../dto/query-estimates.dto';
import { computeEstimateTotals } from './estimate-totals.util';
import { computeLineItemProfit, resolveLaborRate } from './estimate-profit.util';
import { validateServiceDetails } from '../dto/service-details/validate-service-details';

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
  constructor(private readonly prisma: PrismaService) {}

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
          discountType: dto.discountType,
          notes: dto.notes,
          terms: dto.terms,
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
        await tx.estimate.update({ where: { id }, data: { notes: dto.notes, terms: dto.terms } });
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
    return this.prisma.tenant.estimate.update({
      where: { id },
      data: { status: 'sent', sentAt: new Date() },
    });
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
    const estimate = await this.findOne(companyId, id, true);
    if (estimate.status !== 'accepted') {
      throw new BadRequestException(`Cannot convert an estimate with status '${estimate.status}' to a job — only accepted estimates can be converted`);
    }

    return this.prisma.withTenantContext(companyId, async (tx) => {
      // Real double-conversion guard: if a job already exists for this
      // estimate (someone clicked convert twice, or a retry after a
      // network blip), return the existing job instead of silently
      // creating a second one for the same accepted quote.
      const existingJob = await tx.job.findFirst({ where: { estimateId: id, companyId } });
      if (existingJob) return existingJob;

      const jobNumber = `JOB-${Date.now().toString().slice(-6)}`;
      const primaryServiceType = estimate.lineItems[0]?.serviceType ?? null;
      const title = estimate.lineItems.map((li) => li.description).join(', ').slice(0, 200);

      // Unscheduled by design, per explicit requirement — the not-yet-built
      // Scheduler assigns scheduledStart/scheduledEnd later. status stays
      // out of 'scheduled' specifically so this job does NOT appear on the
      // dashboard's calendar query (DashboardService filters on
      // status: 'scheduled'), which is correct: it has no date to show yet.
      return tx.job.create({
        data: {
          companyId,
          customerId: estimate.customerId,
          propertyId: estimate.propertyId,
          estimateId: estimate.id,
          jobNumber,
          title: title || 'Job from estimate',
          serviceType: primaryServiceType,
          status: 'unscheduled',
          price: estimate.totalAmount,
        },
      });
    });
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
           service_details, estimated_labor_hours, estimated_chemical_cost, estimated_equipment_cost, estimated_fuel_cost, estimated_misc_cost, assigned_user_id)
        VALUES
          (${companyId}::uuid, ${estimateId}::uuid, ${item.serviceType}, ${item.description}, ${item.unitOfMeasure}, ${item.quantity}, ${item.unitPrice}, ${item.notes ?? null}, ${i},
           ${serviceDetailsJson}::jsonb, ${item.estimatedLaborHours ?? 0}, ${item.estimatedChemicalCost ?? 0}, ${item.estimatedEquipmentCost ?? 0}, ${item.estimatedFuelCost ?? 0}, ${item.estimatedMiscCost ?? 0}, ${item.assignedUserId ?? null}::uuid)
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
