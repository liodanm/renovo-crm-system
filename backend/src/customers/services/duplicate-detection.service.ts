import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

export interface DuplicateCandidate {
  id: string;
  displayName: string;
  email: string | null;
  phone: string | null;
  matchReason: 'exact_email' | 'exact_phone' | 'similar_name';
  similarity?: number;
}

export interface DuplicateCluster {
  customers: Array<{ id: string; displayName: string; email: string | null; phone: string | null }>;
  reason: 'exact_email' | 'exact_phone' | 'similar_name';
}

const NAME_SIMILARITY_THRESHOLD = 0.45; // pg_trgm similarity, 0-1. Tuned to catch "Mike Ross"/"Michael Ross" without flooding on common surnames.

/**
 * Duplicate detection is ALWAYS advisory, never a hard block on create —
 * two legitimately distinct customers can share a phone (a married
 * couple booking separately) or a very similar name (father/son with the
 * same business). Every consumer of this service surfaces candidates for
 * a human to confirm or dismiss; nothing here auto-merges.
 */
@Injectable()
export class DuplicateDetectionService {
  constructor(private readonly prisma: PrismaService) {}

  /** Used on the create-customer form to warn before saving. */
  async findCandidatesForNewCustomer(
    companyId: string,
    input: { email?: string; phone?: string; firstName?: string; lastName?: string; businessName?: string },
  ): Promise<DuplicateCandidate[]> {
    const candidates: DuplicateCandidate[] = [];

    if (input.email) {
      const matches = await this.prisma.customer.findMany({
        where: { companyId, email: input.email, deletedAt: null },
        select: { id: true, firstName: true, lastName: true, businessName: true, email: true, phone: true },
      });
      candidates.push(...matches.map((m) => this.toCandidate(m, 'exact_email')));
    }

    if (input.phone) {
      const matches = await this.prisma.customer.findMany({
        where: { companyId, phone: input.phone, deletedAt: null },
        select: { id: true, firstName: true, lastName: true, businessName: true, email: true, phone: true },
      });
      candidates.push(...matches.map((m) => this.toCandidate(m, 'exact_phone')));
    }

    const nameQuery = input.businessName || `${input.firstName ?? ''} ${input.lastName ?? ''}`.trim();
    if (nameQuery.length >= 3) {
      const similarityMatches: Array<{ id: string; first_name: string | null; last_name: string | null; business_name: string | null; email: string | null; phone: string | null; sim: number }> =
        await this.prisma.withTenantContext(companyId, (tx) => tx.$queryRaw`
        SELECT id, first_name, last_name, business_name, email, phone,
               similarity(coalesce(first_name,'') || ' ' || coalesce(last_name,'') || ' ' || coalesce(business_name,''), ${nameQuery}) AS sim
        FROM customers
        WHERE company_id = ${companyId}::uuid
          AND deleted_at IS NULL
          AND similarity(coalesce(first_name,'') || ' ' || coalesce(last_name,'') || ' ' || coalesce(business_name,''), ${nameQuery}) > ${NAME_SIMILARITY_THRESHOLD}
        ORDER BY sim DESC
        LIMIT 5
      `);
      candidates.push(
        ...similarityMatches.map((m) => ({
          id: m.id,
          displayName: m.business_name?.trim() || `${m.first_name ?? ''} ${m.last_name ?? ''}`.trim(),
          email: m.email,
          phone: m.phone,
          matchReason: 'similar_name' as const,
          similarity: Math.round(m.sim * 100) / 100,
        })),
      );
    }

    // De-dupe candidates that matched on more than one signal, keeping the strongest reason.
    const byId = new Map<string, DuplicateCandidate>();
    const priority = { exact_email: 3, exact_phone: 2, similar_name: 1 };
    for (const c of candidates) {
      const existing = byId.get(c.id);
      if (!existing || priority[c.matchReason] > priority[existing.matchReason]) {
        byId.set(c.id, c);
      }
    }
    return Array.from(byId.values());
  }

  /**
   * Company-wide scan, used by a "Review duplicates" screen. Groups the
   * whole customer base into clusters by the same three signals. This is
   * O(n) exact-match clustering plus a bounded trigram self-join — fine at
   * CRM scale (thousands of customers per tenant); would need to move to a
   * background job with pagination well before that stops being true.
   */
  async scanForDuplicateClusters(companyId: string): Promise<DuplicateCluster[]> {
    const emailGroups: Array<{ email: string; ids: string[] }> = await this.prisma.withTenantContext(companyId, (tx) => tx.$queryRaw`
      SELECT email, array_agg(id) AS ids
      FROM customers
      WHERE company_id = ${companyId}::uuid AND deleted_at IS NULL AND email IS NOT NULL AND email != ''
      GROUP BY email
      HAVING count(*) > 1
    `);

    const phoneGroups: Array<{ phone: string; ids: string[] }> = await this.prisma.withTenantContext(companyId, (tx) => tx.$queryRaw`
      SELECT phone, array_agg(id) AS ids
      FROM customers
      WHERE company_id = ${companyId}::uuid AND deleted_at IS NULL AND phone IS NOT NULL AND phone != ''
      GROUP BY phone
      HAVING count(*) > 1
    `);

    // Trigram self-join: pair up customers whose combined name string is
    // similar, excluding pairs already caught by exact email/phone above.
    const nameMatches: Array<{ id_a: string; id_b: string; sim: number }> = await this.prisma.withTenantContext(companyId, (tx) => tx.$queryRaw`
      SELECT a.id AS id_a, b.id AS id_b,
             similarity(
               coalesce(a.first_name,'') || ' ' || coalesce(a.last_name,'') || ' ' || coalesce(a.business_name,''),
               coalesce(b.first_name,'') || ' ' || coalesce(b.last_name,'') || ' ' || coalesce(b.business_name,'')
             ) AS sim
      FROM customers a
      JOIN customers b ON a.company_id = b.company_id AND a.id < b.id
      WHERE a.company_id = ${companyId}::uuid AND a.deleted_at IS NULL AND b.deleted_at IS NULL
        AND similarity(
              coalesce(a.first_name,'') || ' ' || coalesce(a.last_name,'') || ' ' || coalesce(a.business_name,''),
              coalesce(b.first_name,'') || ' ' || coalesce(b.last_name,'') || ' ' || coalesce(b.business_name,'')
            ) > ${NAME_SIMILARITY_THRESHOLD}
      ORDER BY sim DESC
      LIMIT 50
    `);

    // Was: one hydrateCustomers() round-trip PER cluster — with, say, 30
    // email groups + 20 phone groups + 50 name matches, up to 100 separate
    // queries for what's fundamentally one "give me these customers" need.
    // Collect every id across all three signals once, hydrate in a single
    // batched query, then build clusters from an in-memory lookup.
    const allIds = new Set<string>();
    emailGroups.forEach((g) => g.ids.forEach((id) => allIds.add(id)));
    phoneGroups.forEach((g) => g.ids.forEach((id) => allIds.add(id)));
    nameMatches.forEach((m) => { allIds.add(m.id_a); allIds.add(m.id_b); });

    const hydratedById = await this.hydrateCustomersById(Array.from(allIds));

    const clusters: DuplicateCluster[] = [
      ...emailGroups.map((g) => ({ customers: g.ids.map((id) => hydratedById.get(id)).filter(Boolean) as DuplicateCluster['customers'], reason: 'exact_email' as const })),
      ...phoneGroups.map((g) => ({ customers: g.ids.map((id) => hydratedById.get(id)).filter(Boolean) as DuplicateCluster['customers'], reason: 'exact_phone' as const })),
      ...nameMatches.map((m) => ({ customers: [m.id_a, m.id_b].map((id) => hydratedById.get(id)).filter(Boolean) as DuplicateCluster['customers'], reason: 'similar_name' as const })),
    ];

    return clusters;
  }

  private async hydrateCustomersById(ids: string[]): Promise<Map<string, DuplicateCluster['customers'][number]>> {
    const customers = await this.prisma.customer.findMany({
      where: { id: { in: ids } },
      select: { id: true, firstName: true, lastName: true, businessName: true, email: true, phone: true },
    });
    const map = new Map<string, DuplicateCluster['customers'][number]>();
    customers.forEach((c) => {
      map.set(c.id, { id: c.id, displayName: c.businessName?.trim() || `${c.firstName ?? ''} ${c.lastName ?? ''}`.trim(), email: c.email, phone: c.phone });
    });
    return map;
  }

  private toCandidate(
    m: { id: string; firstName: string | null; lastName: string | null; businessName: string | null; email: string | null; phone: string | null },
    reason: DuplicateCandidate['matchReason'],
  ): DuplicateCandidate {
    return {
      id: m.id,
      displayName: m.businessName?.trim() || `${m.firstName ?? ''} ${m.lastName ?? ''}`.trim(),
      email: m.email,
      phone: m.phone,
      matchReason: reason,
    };
  }
}
