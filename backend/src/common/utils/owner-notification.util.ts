import { PrismaService } from '../prisma/prisma.service';

/**
 * Creates an in-app owner notification, reusing the existing
 * `notifications` table (already read by dashboard.service.ts's
 * getNotifications — this is the first thing that ever writes to it;
 * the table was fully designed but never wired up before this).
 *
 * Idempotency: same pattern as automation-event.util.ts's
 * logAutomationEvent — a unique index on (company_id, dedupe_key)
 * with ON CONFLICT DO NOTHING, not a second, differently-shaped
 * dedup mechanism for this one call site.
 *
 * "Owner" = every company_user with the 'owner' role (roles.name =
 * 'owner', the exact lookup convention already used elsewhere in this
 * codebase) — for Renovo's current solo-owner-focused product this is
 * normally exactly one person; the query still correctly notifies
 * every owner if a company ever has more than one.
 *
 * `notifications` has no RLS (confirmed: it's a pre-migration table
 * from the original schema baseline, never retrofitted — a real,
 * separate finding, not something silently fixed here since that's a
 * meaningfully bigger, out-of-scope change). This function explicitly
 * filters by company_id on every query itself, rather than leaning on
 * a tenant-context mechanism this table was never given.
 */
export async function createOwnerNotification(
  prisma: PrismaService,
  input: {
    companyId: string;
    notificationType: string;
    title: string;
    body: string;
    relatedEntityType?: string;
    relatedEntityId?: string;
    dedupeKey: string;
  },
): Promise<void> {
  try {
    const owners = await prisma.withTenantContext(input.companyId, (tx) =>
      tx.$queryRaw<{ id: string }[]>`
        SELECT u.id FROM users u
        JOIN company_users cu ON cu.user_id = u.id
        JOIN roles r ON r.id = cu.role_id
        WHERE cu.company_id = ${input.companyId}::uuid AND r.name = 'owner' AND cu.status = 'active'
      `,
    );

    for (const owner of owners) {
      await prisma.withTenantContext(input.companyId, (tx) =>
        tx.$executeRaw`
          INSERT INTO notifications (company_id, user_id, notification_type, title, body, related_entity_type, related_entity_id, channel, status, dedupe_key)
          VALUES (${input.companyId}::uuid, ${owner.id}::uuid, ${input.notificationType}, ${input.title}, ${input.body},
                  ${input.relatedEntityType ?? null}, ${input.relatedEntityId ?? null}::uuid, 'in_app', 'sent', ${`${input.dedupeKey}:${owner.id}`})
          ON CONFLICT (company_id, dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING
        `,
      );
    }
  } catch {
    // Same principle as logAutomationEvent: notifying the owner must
    // never break the actual customer-facing action (accepting or
    // declining a quote) that triggered it.
  }
}
