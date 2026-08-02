import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateCustomerDto } from '../dto/create-customer.dto';
import { UpdateCustomerDto } from '../dto/update-customer.dto';
import { QueryCustomersDto } from '../dto/query-customers.dto';
import { DuplicateDetectionService } from './duplicate-detection.service';

const DEFAULT_PAGE_SIZE = 25;

@Injectable()
export class CustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly duplicateDetection: DuplicateDetectionService,
  ) {}

  // ===========================================================================
  // List / search / filter
  // ===========================================================================

  async list(companyId: string, query: QueryCustomersDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;

    const where: Prisma.CustomerWhereInput = { companyId, deletedAt: null };

    if (query.customerType) where.customerType = query.customerType;
    if (query.leadStatus) where.leadStatus = query.leadStatus;
    if (query.tags) {
      const tagList = query.tags.split(',').map((t) => t.trim()).filter(Boolean);
      if (tagList.length > 0) where.tags = { hasSome: tagList };
    }
    if (query.createdAfter || query.createdBefore) {
      where.createdAt = {
        ...(query.createdAfter ? { gte: new Date(query.createdAfter) } : {}),
        ...(query.createdBefore ? { lte: new Date(query.createdBefore) } : {}),
      };
    }

    // Search uses ILIKE across name/business/email/phone. For companies
    // with a large customer base this is backed by the trigram GIN index
    // (idx_customers_name_trgm) from the base schema for the name portion;
    // email/phone use their own btree indexes. Good up to hundreds of
    // thousands of rows per tenant — a dedicated search service (e.g.
    // OpenSearch) is the documented upgrade path in the architecture doc
    // if that ever stops being true.
    if (query.search && query.search.trim().length > 0) {
      const term = query.search.trim();
      where.OR = [
        { firstName: { contains: term, mode: 'insensitive' } },
        { lastName: { contains: term, mode: 'insensitive' } },
        { businessName: { contains: term, mode: 'insensitive' } },
        { email: { contains: term, mode: 'insensitive' } },
        { phone: { contains: term } },
      ];
    }

    const orderBy = this.buildOrderBy(query.sortBy, query.sortDir);

    const [total, customers] = await Promise.all([
      this.prisma.customer.count({ where }),
      this.prisma.customer.findMany({
        where,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          properties: { where: { deletedAt: null }, select: { id: true, city: true, state: true }, take: 3 },
        },
      }),
    ]);

    // Balance due + last service date, batched for just this page's
    // customer IDs (not the whole table) — same underlying fields the
    // Invoices/Jobs modules already use, just aggregated per-customer
    // for the list view. Optional columns; adds one query pair per
    // page load, not per row.
    const customerIds = customers.map((c) => c.id);
    const [balances, lastServices] = customerIds.length
      ? await Promise.all([
          this.prisma.invoice.groupBy({
            by: ['customerId'],
            where: { companyId, customerId: { in: customerIds }, status: { notIn: ['draft', 'void'] } },
            _sum: { balanceDue: true },
          }),
          this.prisma.job.groupBy({
            by: ['customerId'],
            where: { companyId, customerId: { in: customerIds }, actualEnd: { not: null } },
            _max: { actualEnd: true },
          }),
        ])
      : [[], []];
    const balanceByCustomer = new Map(balances.map((b) => [b.customerId, (b._sum.balanceDue ?? 0).toString()]));
    const lastServiceByCustomer = new Map(lastServices.map((j) => [j.customerId, j._max.actualEnd]));

    return {
      data: customers.map((c) => ({
        ...this.toSummary(c),
        balanceDue: balanceByCustomer.get(c.id) ?? '0',
        lastServiceDate: lastServiceByCustomer.get(c.id) ?? null,
      })),
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    };
  }

  private buildOrderBy(sortBy?: string, sortDir?: 'asc' | 'desc'): Prisma.CustomerOrderByWithRelationInput {
    const dir = sortDir ?? 'desc';
    switch (sortBy) {
      case 'name':
        return { firstName: dir };
      case 'lifetimeValue':
        return { lifetimeValue: dir };
      case 'updatedAt':
        return { updatedAt: dir };
      case 'createdAt':
      default:
        return { createdAt: dir };
    }
  }

  // ===========================================================================
  // Create
  // ===========================================================================

  async create(companyId: string, createdByUserId: string, dto: CreateCustomerDto) {
    if (!dto.businessName && !dto.firstName) {
      throw new BadRequestException('Either firstName or businessName is required');
    }

    // Duplicate detection is advisory (see DuplicateDetectionService) — we
    // still create the record even if candidates exist, UNLESS the caller
    // hasn't acknowledged an exact email match, which is the one signal
    // strong enough to warrant a hard stop by default (a typo'd re-entry
    // of literally the same customer is far more common than two real
    // customers sharing an email). Shared with update() below — same
    // check, not a second one.
    if (dto.email) {
      await this.assertNoExactEmailConflict(companyId, dto.email, dto.acknowledgedDuplicateWarning);
    }

    const customer = await this.prisma.customer.create({
      data: {
        companyId,
        customerType: dto.customerType,
        firstName: dto.firstName,
        lastName: dto.lastName,
        businessName: dto.businessName,
        email: dto.email,
        phone: dto.phone,
        secondaryPhone: dto.secondaryPhone,
        source: dto.source,
        leadStatus: dto.leadStatus ?? 'lead',
        tags: dto.tags ?? [],
        notesText: dto.notesText,
        createdBy: createdByUserId,
        properties: dto.properties?.length
          ? {
              create: dto.properties.map((p) => ({
                companyId,
                label: p.label,
                addressLine1: p.addressLine1,
                city: p.city,
                state: p.state,
                postalCode: p.postalCode,
                latitude: p.latitude,
                longitude: p.longitude,
              })),
            }
          : undefined,
      },
      include: { properties: true },
    });

    return customer;
  }

  /**
   * Additive — create() above is completely unchanged and still throws
   * ConflictException on an exact-email match for every existing staff
   * call site (New Estimate's inline creation, the Customers page, Quick
   * Add), which is the correct behavior when a person is deliberately
   * asking "does this already exist." This method exists for exactly one
   * caller: the Quote Widget (Phase 1), where a homeowner submitting a
   * public form should never see that error — they should silently land
   * on their own existing record instead. Reuses the exact same
   * exact-email lookup create() already does internally, so there's
   * still only one "find a customer by email for this company" query in
   * the codebase, not two.
   */
  async findOrCreateByEmail(companyId: string, createdByLabel: string, dto: CreateCustomerDto) {
    if (dto.email) {
      const existing = await this.prisma.customer.findFirst({
        where: { companyId, email: dto.email, deletedAt: null },
        include: { properties: { where: { deletedAt: null } } },
      });
      if (existing) return { customer: existing, wasExisting: true };
    }

    const customer = await this.create(companyId, createdByLabel, { ...dto, acknowledgedDuplicateWarning: true });
    return { customer, wasExisting: false };
  }

  // ===========================================================================
  // Read / update / delete
  // ===========================================================================

  async getProfile(companyId: string, customerId: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, companyId, deletedAt: null },
      include: {
        properties: { where: { deletedAt: null }, orderBy: { createdAt: 'asc' } },
      },
    });

    if (!customer) throw new NotFoundException('Customer not found');

    const [customFieldValues, balanceAgg, openEstimatesCount, openInvoicesCount] = await Promise.all([
      this.prisma.customFieldValue.findMany({
        where: { companyId, entityId: customerId },
        include: { fieldDefinition: true },
      }),
      // "Money at a glance" — the customer profile previously had no
      // visibility into whether this person owes money, forcing a
      // separate trip to the Invoices module for something that should
      // be answerable the moment the phone rings. Sums real balanceDue
      // across their non-draft, non-void invoices — same field the
      // Invoices module itself displays, not a re-derived duplicate.
      this.prisma.invoice.aggregate({
        where: { companyId, customerId, status: { notIn: ['draft', 'void'] } },
        _sum: { balanceDue: true },
      }),
      this.prisma.estimate.count({
        where: { companyId, customerId, status: { in: ['draft', 'sent', 'viewed'] } },
      }),
      this.prisma.invoice.count({
        where: { companyId, customerId, status: { notIn: ['draft', 'void'] }, balanceDue: { gt: 0 } },
      }),
    ]);

    return {
      ...customer,
      customFields: customFieldValues.map((v) => ({
        fieldKey: v.fieldDefinition.fieldKey,
        label: v.fieldDefinition.label,
        fieldType: v.fieldDefinition.fieldType,
        value: v.value,
      })),
      balanceDue: (balanceAgg._sum.balanceDue ?? 0).toString(),
      openEstimatesCount,
      openInvoicesCount,
    };
  }

  /**
   * Shared by create() and update() — one exact-email hard-stop, not two.
   * update() previously had no duplicate-email check at all; this closes
   * that gap using the exact same rule create() already enforces, rather
   * than leaving edit unprotected or inventing a different rule for it.
   * excludeCustomerId keeps an unrelated edit (or re-saving the same
   * email unchanged) from matching itself.
   */
  private async assertNoExactEmailConflict(companyId: string, email: string, acknowledgedDuplicateWarning?: boolean, excludeCustomerId?: string) {
    if (acknowledgedDuplicateWarning) return;
    const exactEmailMatch = await this.prisma.customer.findFirst({
      where: { companyId, email, deletedAt: null, ...(excludeCustomerId ? { id: { not: excludeCustomerId } } : {}) },
    });
    if (exactEmailMatch) {
      throw new ConflictException({
        message: 'A customer with this email already exists',
        existingCustomerId: exactEmailMatch.id,
      });
    }
  }

  async update(companyId: string, customerId: string, dto: UpdateCustomerDto) {
    await this.assertExists(companyId, customerId);

    if (dto.email) {
      await this.assertNoExactEmailConflict(companyId, dto.email, dto.acknowledgedDuplicateWarning, customerId);
    }

    return this.prisma.customer.update({
      where: { id: customerId },
      data: {
        customerType: dto.customerType,
        firstName: dto.firstName,
        lastName: dto.lastName,
        businessName: dto.businessName,
        email: dto.email,
        phone: dto.phone,
        secondaryPhone: dto.secondaryPhone,
        source: dto.source,
        leadStatus: dto.leadStatus,
        tags: dto.tags,
        notesText: dto.notesText,
      },
    });
  }

  async softDelete(companyId: string, customerId: string) {
    await this.assertExists(companyId, customerId);
    await this.prisma.customer.update({ where: { id: customerId }, data: { deletedAt: new Date() } });
    return { message: 'Customer deleted' };
  }

  /**
   * Not a second delete path — this calls softDelete() once per id, the
   * exact same method the single-delete route uses, so every record goes
   * through identical RLS scoping, existence checking, and soft-delete
   * semantics. Promise.allSettled rather than a single transaction: one
   * stale/already-deleted id in the batch shouldn't silently block the
   * rest from being deleted, and each softDelete() call is already
   * independently safe on its own.
   */
  async bulkSoftDelete(companyId: string, customerIds: string[]) {
    const results = await Promise.allSettled(customerIds.map((id) => this.softDelete(companyId, id)));
    const succeeded: string[] = [];
    const failed: { id: string; reason: string }[] = [];
    results.forEach((result, i) => {
      if (result.status === 'fulfilled') succeeded.push(customerIds[i]);
      else failed.push({ id: customerIds[i], reason: result.reason instanceof Error ? result.reason.message : 'Failed to delete' });
    });
    return { succeeded, failed };
  }

  private async assertExists(companyId: string, customerId: string) {
    const customer = await this.prisma.customer.findFirst({ where: { id: customerId, companyId, deletedAt: null } });
    if (!customer) throw new NotFoundException('Customer not found');
    return customer;
  }

  // ===========================================================================
  // Service history — jobs, estimates, invoices, payments for this customer
  // ===========================================================================

  async getServiceHistory(companyId: string, customerId: string) {
    await this.assertExists(companyId, customerId);

    const [jobs, estimates, invoices, payments] = await Promise.all([
      this.prisma.job.findMany({
        where: { companyId, customerId },
        orderBy: { scheduledStart: 'desc' },
        include: { property: { select: { addressLine1: true, city: true } } },
      }),
      this.prisma.estimate.findMany({ where: { companyId, customerId }, orderBy: { createdAt: 'desc' } }),
      this.prisma.invoice.findMany({ where: { companyId, customerId }, orderBy: { createdAt: 'desc' } }),
      this.prisma.payment.findMany({ where: { companyId, customerId }, orderBy: { processedAt: 'desc' } }),
    ]);

    const lifetimeSpend = payments
      .filter((p) => p.status === 'succeeded')
      .reduce((sum, p) => sum + p.amount.toNumber(), 0);

    return {
      summary: {
        totalJobs: jobs.length,
        completedJobs: jobs.filter((j) => j.status === 'completed').length,
        lifetimeSpend,
        outstandingBalance: invoices.reduce(
          (sum, inv) => sum + (inv.totalAmount.toNumber() - inv.amountPaid.toNumber()),
          0,
        ),
      },
      jobs: jobs.map((j) => ({
        id: j.id,
        title: j.title,
        status: j.status,
        scheduledStart: j.scheduledStart,
        price: j.price.toNumber(),
        address: `${j.property.addressLine1}, ${j.property.city}`,
      })),
      estimates: estimates.map((e) => ({
        id: e.id,
        status: e.status,
        totalAmount: e.totalAmount.toNumber(),
        sentAt: e.sentAt,
        createdAt: e.createdAt,
      })),
      invoices: invoices.map((i) => ({
        id: i.id,
        invoiceNumber: i.invoiceNumber,
        status: i.status,
        totalAmount: i.totalAmount.toNumber(),
        amountPaid: i.amountPaid.toNumber(),
        dueDate: i.dueDate,
      })),
      payments: payments.map((p) => ({
        id: p.id,
        amount: p.amount.toNumber(),
        method: p.method,
        status: p.status,
        processedAt: p.processedAt,
      })),
    };
  }

  // ===========================================================================
  // Activity timeline — unified, chronological feed across every subsystem
  // that touches this customer
  // ===========================================================================

  async getActivityTimeline(companyId: string, customerId: string, limit = 50) {
    await this.assertExists(companyId, customerId);

    const [jobs, estimates, invoices, payments, notes] = await Promise.all([
      this.prisma.job.findMany({
        where: { companyId, customerId },
        select: { id: true, title: true, status: true, createdAt: true },
      }),
      this.prisma.estimate.findMany({
        where: { companyId, customerId },
        select: { id: true, status: true, sentAt: true, createdAt: true },
      }),
      this.prisma.invoice.findMany({
        where: { companyId, customerId },
        select: { id: true, invoiceNumber: true, status: true, createdAt: true, paidAt: true },
      }),
      this.prisma.payment.findMany({
        where: { companyId, customerId },
        select: { id: true, amount: true, processedAt: true, createdAt: true },
      }),
      this.prisma.customerNote.findMany({
        where: { companyId, customerId, deletedAt: null },
        select: { id: true, body: true, createdAt: true, authorUserId: true },
      }),
    ]);

    type TimelineEvent = { id: string; type: string; description: string; occurredAt: Date };
    const events: TimelineEvent[] = [];

    for (const j of jobs) {
      events.push({ id: j.id, type: 'job', description: `Job "${j.title}" ${j.status}`, occurredAt: j.createdAt });
    }
    for (const e of estimates) {
      events.push({ id: e.id, type: 'estimate', description: `Estimate ${e.status}`, occurredAt: e.sentAt ?? e.createdAt });
    }
    for (const i of invoices) {
      events.push({ id: i.id, type: 'invoice', description: `Invoice ${i.invoiceNumber} created`, occurredAt: i.createdAt });
      if (i.paidAt) {
        events.push({
          id: `${i.id}-paid`,
          type: 'invoice_paid',
          description: `Invoice ${i.invoiceNumber} paid in full`,
          occurredAt: i.paidAt,
        });
      }
    }
    for (const p of payments) {
      events.push({
        id: p.id,
        type: 'payment',
        description: `Payment of $${p.amount.toNumber().toFixed(2)} received`,
        occurredAt: p.processedAt ?? p.createdAt,
      });
    }
    for (const n of notes) {
      events.push({ id: n.id, type: 'note', description: n.body.slice(0, 140), occurredAt: n.createdAt });
    }

    events.sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());
    return events.slice(0, limit);
  }

  // ===========================================================================
  // Merge — folds a duplicate customer into a canonical one
  // ===========================================================================

  /**
   * Re-points every child record (properties, jobs, estimates, invoices,
   * payments, notes, photos, documents) from `duplicateId` to
   * `canonicalId`, unions their tags, and soft-deletes the duplicate. Runs
   * in a single transaction — a partial merge would be worse than no merge.
   */
  async merge(companyId: string, canonicalId: string, duplicateId: string) {
    if (canonicalId === duplicateId) {
      throw new BadRequestException('Cannot merge a customer into itself');
    }

    const [canonical, duplicate] = await Promise.all([
      this.assertExists(companyId, canonicalId),
      this.assertExists(companyId, duplicateId),
    ]);

    await this.prisma.$transaction([
      this.prisma.property.updateMany({ where: { customerId: duplicateId }, data: { customerId: canonicalId } }),
      this.prisma.job.updateMany({ where: { customerId: duplicateId }, data: { customerId: canonicalId } }),
      this.prisma.estimate.updateMany({ where: { customerId: duplicateId }, data: { customerId: canonicalId } }),
      this.prisma.invoice.updateMany({ where: { customerId: duplicateId }, data: { customerId: canonicalId } }),
      this.prisma.payment.updateMany({ where: { customerId: duplicateId }, data: { customerId: canonicalId } }),
      this.prisma.customerNote.updateMany({ where: { customerId: duplicateId }, data: { customerId: canonicalId } }),
      this.prisma.photo.updateMany({ where: { customerId: duplicateId }, data: { customerId: canonicalId } }),
      this.prisma.document.updateMany({ where: { customerId: duplicateId }, data: { customerId: canonicalId } }),
      this.prisma.customer.update({
        where: { id: canonicalId },
        data: { tags: { set: Array.from(new Set([...canonical.tags, ...duplicate.tags])) } },
      }),
      this.prisma.customer.update({
        where: { id: duplicateId },
        data: { deletedAt: new Date(), notesText: `[Merged into ${canonicalId}]` },
      }),
    ]);

    return this.getProfile(companyId, canonicalId);
  }

  // ===========================================================================
  // Duplicate detection passthrough (kept on this service's public surface
  // so the controller has one dependency for all customer read operations)
  // ===========================================================================

  checkDuplicates(companyId: string, input: Parameters<DuplicateDetectionService['findCandidatesForNewCustomer']>[1]) {
    return this.duplicateDetection.findCandidatesForNewCustomer(companyId, input);
  }

  scanDuplicateClusters(companyId: string) {
    return this.duplicateDetection.scanForDuplicateClusters(companyId);
  }

  private toSummary(
    c: Prisma.CustomerGetPayload<{ include: { properties: { select: { id: true; city: true; state: true } } } }>,
  ) {
    return {
      id: c.id,
      displayName: c.businessName ?? `${c.firstName ?? ''} ${c.lastName ?? ''}`.trim(),
      customerType: c.customerType,
      email: c.email,
      phone: c.phone,
      leadStatus: c.leadStatus,
      lifetimeValue: c.lifetimeValue.toNumber(),
      tags: c.tags,
      propertyCount: c.properties.length,
      primaryLocation: c.properties[0] ? `${c.properties[0].city}, ${c.properties[0].state}` : null,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    };
  }
}
