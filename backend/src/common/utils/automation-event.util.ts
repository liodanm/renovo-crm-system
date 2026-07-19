import { PrismaService } from '../prisma/prisma.service';

/**
 * A small, shared insert into the real, already-working AutomationLog
 * table (not the dormant automations/automation_steps rules engine —
 * see the audit note on that distinction). "Estimate/Invoice Sent"
 * events are deliberately NOT logged here: email_log already records
 * every send attempt with real delivery status, so writing a second,
 * parallel "sent" event here would just be the same fact in two places.
 * What's genuinely new here are the one-time status transitions that had
 * nowhere to be recorded before: viewed, approved, declined, paid.
 *
 * Uses raw SQL rather than the typed Prisma model accessor — this
 * sandbox's generated Prisma client is stale relative to the current
 * schema (a known, accepted limitation throughout this project), so a
 * typed .automationLog.upsert() call doesn't type-check even though the
 * model is real. Goes through withTenantContext explicitly, since
 * automation_log has RLS forced and raw queries are never covered by
 * the tenant-context Prisma extension (only model operations are).
 *
 * ON CONFLICT DO NOTHING (matching automation_log's own unique index on
 * company_id + dedupe_key) makes a duplicate call — a webhook
 * redelivery, or re-checking an already-viewed estimate — a safe no-op
 * rather than a thrown error.
 */
export async function logAutomationEvent(
  prisma: PrismaService,
  input: { companyId: string; customerId: string; ruleType: string; dedupeKey: string; messageBody: string },
): Promise<void> {
  try {
    await prisma.withTenantContext(input.companyId, (tx) =>
      tx.$executeRaw`
        INSERT INTO automation_log (company_id, customer_id, rule_type, dedupe_key, channel, message_body, status, sent_at)
        VALUES (${input.companyId}::uuid, ${input.customerId}::uuid, ${input.ruleType}, ${input.dedupeKey}, 'system', ${input.messageBody}, 'sent', now())
        ON CONFLICT (company_id, dedupe_key) DO NOTHING
      `,
    );
  } catch {
    // Logging a lifecycle event must never break the actual customer-
    // facing action (viewing a PDF, approving an estimate, a payment
    // webhook) that triggered it.
  }
}
