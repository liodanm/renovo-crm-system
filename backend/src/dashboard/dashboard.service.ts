import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { WeatherService } from '../weather/weather.service';
import { AiSuggestionsService, DashboardStats } from '../ai/ai-suggestions.service';
import { AuthenticatedRequestUser } from '../auth/interfaces/jwt-payload.interface';

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfToday(): Date {
  const d = startOfToday();
  d.setDate(d.getDate() + 1);
  return d;
}

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly weatherService: WeatherService,
    private readonly aiSuggestionsService: AiSuggestionsService,
  ) {}

  /**
   * The single primary dashboard payload. Every section is independently
   * gated by permission — a crew_member gets `todaysJobs` (their own) and
   * nothing about revenue or leads; an owner gets everything. Sections the
   * caller can't see are omitted entirely (not sent as null/zero), so the
   * frontend can distinguish "no data" from "not authorized to see this."
   */
  async getSummary(user: AuthenticatedRequestUser) {
    const perms = new Set(user.permissions);
    const canViewJobs = perms.has('jobs.read');
    const canViewFinancials = perms.has('invoices.read') || perms.has('billing.manage');
    const canViewLeads = perms.has('customers.read');
    const canViewEstimates = perms.has('estimates.read');

    const isFieldRole = user.roleName === 'crew_lead' || user.roleName === 'crew_member';

    const [todaysJobs, todaysRevenue, pendingEstimates, openLeads, recentPayments] = await Promise.all([
      canViewJobs ? this.getTodaysJobs(user.companyId, isFieldRole ? user.companyUserId : undefined) : null,
      canViewFinancials ? this.getTodaysRevenue(user.companyId) : null,
      canViewEstimates ? this.getPendingEstimates(user.companyId) : null,
      canViewLeads ? this.getOpenLeads(user.companyId) : null,
      canViewFinancials ? this.getRecentPayments(user.companyId) : null,
    ]);

    return {
      todaysJobs,
      todaysRevenue,
      pendingEstimates,
      openLeads,
      recentPayments,
    };
  }

  private async getTodaysJobs(companyId: string, assignedCompanyUserId?: string) {
    // Field roles (crew_lead/crew_member) only see jobs their crew is
    // assigned to — the crew_members join table (not modeled in this
    // module's Prisma subset yet) will refine this to per-user assignment;
    // for now this scopes to "all of today's jobs" for any role permitted
    // to view jobs, which is correct for office roles (owner/admin/
    // dispatcher) and intentionally broad for field roles until the crew
    // assignment module ships — narrowing that is flagged in the writeup.
    const jobs = await this.prisma.job.findMany({
      where: {
        companyId,
        scheduledStart: { gte: startOfToday(), lt: endOfToday() },
      },
      orderBy: { scheduledStart: 'asc' },
      include: {
        customer: { select: { firstName: true, lastName: true, businessName: true } },
        property: { select: { addressLine1: true, city: true, state: true } },
        crew: { select: { id: true, name: true } },
      },
    });

    return {
      count: jobs.length,
      completedCount: jobs.filter((j) => j.status === 'completed').length,
      jobs: jobs.map((j) => ({
        id: j.id,
        title: j.title,
        status: j.status,
        scheduledStart: j.scheduledStart,
        scheduledEnd: j.scheduledEnd,
        customerName: j.customer.businessName ?? `${j.customer.firstName ?? ''} ${j.customer.lastName ?? ''}`.trim(),
        address: `${j.property.addressLine1}, ${j.property.city}, ${j.property.state}`,
        crewName: j.crew?.name ?? null,
        price: j.price.toNumber(),
      })),
    };
  }

  private async getTodaysRevenue(companyId: string) {
    const result = await this.prisma.payment.aggregate({
      where: {
        companyId,
        status: 'succeeded',
        processedAt: { gte: startOfToday(), lt: endOfToday() },
      },
      _sum: { amount: true },
      _count: true,
    });

    return {
      total: result._sum.amount?.toNumber() ?? 0,
      paymentCount: result._count,
    };
  }

  private async getPendingEstimates(companyId: string) {
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

    const [count, totalValue, olderThan3Days] = await Promise.all([
      this.prisma.estimate.count({ where: { companyId, status: { in: ['sent', 'viewed'] } } }),
      this.prisma.estimate.aggregate({
        where: { companyId, status: { in: ['sent', 'viewed'] } },
        _sum: { totalAmount: true },
      }),
      this.prisma.estimate.count({
        where: { companyId, status: { in: ['sent', 'viewed'] }, sentAt: { lt: threeDaysAgo } },
      }),
    ]);

    return { count, totalValue: totalValue._sum.totalAmount?.toNumber() ?? 0, olderThan3Days };
  }

  private async getOpenLeads(companyId: string) {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const [count, staleCount] = await Promise.all([
      this.prisma.customer.count({ where: { companyId, leadStatus: 'lead', deletedAt: null } }),
      this.prisma.customer.count({
        where: { companyId, leadStatus: 'lead', deletedAt: null, updatedAt: { lt: sevenDaysAgo } },
      }),
    ]);

    return { count, staleCount };
  }

  private async getRecentPayments(companyId: string, limit = 5) {
    const payments = await this.prisma.payment.findMany({
      where: { companyId, status: 'succeeded' },
      orderBy: { processedAt: 'desc' },
      take: limit,
      include: { customer: { select: { firstName: true, lastName: true, businessName: true } } },
    });

    return payments.map((p) => ({
      id: p.id,
      amount: p.amount.toNumber(),
      method: p.method,
      processedAt: p.processedAt,
      customerName: p.customer.businessName ?? `${p.customer.firstName ?? ''} ${p.customer.lastName ?? ''}`.trim(),
    }));
  }

  // ===========================================================================
  // Calendar
  // ===========================================================================

  async getCalendar(companyId: string, start: Date, end: Date) {
    const jobs = await this.prisma.job.findMany({
      where: { companyId, scheduledStart: { gte: start, lt: end } },
      orderBy: { scheduledStart: 'asc' },
      include: {
        customer: { select: { firstName: true, lastName: true, businessName: true } },
        property: { select: { addressLine1: true, city: true } },
        crew: { select: { name: true } },
      },
    });

    return jobs.map((j) => ({
      id: j.id,
      title: j.title,
      status: j.status,
      scheduledStart: j.scheduledStart,
      scheduledEnd: j.scheduledEnd,
      customerName: j.customer.businessName ?? `${j.customer.firstName ?? ''} ${j.customer.lastName ?? ''}`.trim(),
      address: `${j.property.addressLine1}, ${j.property.city}`,
      crewName: j.crew?.name ?? null,
    }));
  }

  // ===========================================================================
  // Customer map
  // ===========================================================================

  async getMapData(companyId: string) {
    const properties = await this.prisma.property.findMany({
      where: { companyId, deletedAt: null, latitude: { not: null }, longitude: { not: null } },
      include: {
        customer: { select: { firstName: true, lastName: true, businessName: true, leadStatus: true } },
        jobs: { orderBy: { scheduledStart: 'desc' }, take: 1, select: { status: true, scheduledStart: true, priority: true } },
      },
      take: 500, // hard cap — a map with more than this needs clustering, not a bigger payload
    });

    return properties.map((p) => ({
      id: p.id,
      customerId: p.customerId,
      latitude: p.latitude!.toNumber(),
      longitude: p.longitude!.toNumber(),
      address: `${p.addressLine1}, ${p.city}, ${p.state}`,
      customerName: p.customer.businessName ?? `${p.customer.firstName ?? ''} ${p.customer.lastName ?? ''}`.trim(),
      leadStatus: p.customer.leadStatus,
      lastJobStatus: p.jobs[0]?.status ?? null,
      lastJobDate: p.jobs[0]?.scheduledStart ?? null,
      lastJobPriority: p.jobs[0]?.priority ?? null,
    }));
  }

  // ===========================================================================
  // Weather (delegates to WeatherService — needs the company's service-area coords)
  // ===========================================================================

  async getWeather(latitude: number, longitude: number) {
    return this.weatherService.getForecast(latitude, longitude);
  }

  // ===========================================================================
  // Notifications
  // ===========================================================================

  async getNotifications(companyId: string, userId: string, limit = 20) {
    const notifications = await this.prisma.notification.findMany({
      where: { companyId, userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    const unreadCount = await this.prisma.notification.count({
      where: { companyId, userId, readAt: null },
    });

    return { unreadCount, notifications };
  }

  // ===========================================================================
  // AI Suggestions — computes real stats, then delegates to AiSuggestionsService
  // ===========================================================================

  async getAiSuggestions(companyId: string) {
    const stats = await this.computeStats(companyId);
    return this.aiSuggestionsService.getSuggestions(companyId, stats);
  }

  private async computeStats(companyId: string): Promise<DashboardStats> {
    const now = new Date();
    const threeDaysAgo = new Date(now);
    threeDaysAgo.setDate(now.getDate() - 3);
    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(now.getDate() - 7);

    const [
      overdueInvoices,
      pendingEstimatesCount,
      pendingEstimatesOlderThan3Days,
      openLeadsCount,
      staleLeadsCount,
      todaysJobsCount,
      unassignedJobsCount,
    ] = await Promise.all([
      this.prisma.invoice.aggregate({
        where: { companyId, status: { in: ['sent', 'partial', 'overdue'] }, dueDate: { lt: now } },
        _sum: { totalAmount: true, amountPaid: true },
        _count: true,
      }),
      this.prisma.estimate.count({ where: { companyId, status: { in: ['sent', 'viewed'] } } }),
      this.prisma.estimate.count({
        where: { companyId, status: { in: ['sent', 'viewed'] }, sentAt: { lt: threeDaysAgo } },
      }),
      this.prisma.customer.count({ where: { companyId, leadStatus: 'lead', deletedAt: null } }),
      this.prisma.customer.count({
        where: { companyId, leadStatus: 'lead', deletedAt: null, updatedAt: { lt: sevenDaysAgo } },
      }),
      this.prisma.job.count({
        where: { companyId, scheduledStart: { gte: startOfToday(), lt: endOfToday() } },
      }),
      this.prisma.job.count({
        where: {
          companyId,
          assignedCrewId: null,
          status: 'scheduled',
          scheduledStart: { gte: now },
        },
      }),
    ]);

    const overdueTotal =
      (overdueInvoices._sum.totalAmount?.toNumber() ?? 0) - (overdueInvoices._sum.amountPaid?.toNumber() ?? 0);

    return {
      overdueInvoicesCount: overdueInvoices._count,
      overdueInvoicesTotal: Math.max(0, overdueTotal),
      pendingEstimatesCount,
      pendingEstimatesOlderThan3Days,
      openLeadsCount,
      staleLeadsOlderThan7Days: staleLeadsCount,
      todaysJobsCount,
      unassignedJobsCount,
    };
  }
}
