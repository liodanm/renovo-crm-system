// One-time backfill: recalculates every customer's lifetimeValue from
// their actual payment history. Phase 2 of the Lifetime Value fix — see
// PROJECT_CONTEXT.md. Phase 1 (already shipped) keeps lifetimeValue
// accurate going forward for every new payment/refund/void; this script
// corrects every customer whose value predates Phase 1, or who
// accumulated a mix of pre- and post-Phase-1 history.
//
// SETS lifetime_value to the full recalculated total (not an increment)
// — this is what makes it safe to re-run. Recalculating from the same
// payment rows always produces the same answer whether run once or ten
// times, and correctly captures both pre- and post-Phase-1 payments in
// one pass with no double-counting risk.
//
// Formula: SUM(amount - refunded_amount) across every payment that was
// ever successfully collected (status IN succeeded/partially_refunded/
// refunded) — matches Phase 1's incremental logic exactly. A fully
// refunded payment nets to $0; a partial refund nets to what's left;
// a plain succeeded payment (refunded_amount = 0 by default) counts in
// full. 'failed'/'pending'/'void' payments never counted and still don't.
//
// Dry-run by default — this touches financial data on every customer,
// so nothing writes unless you explicitly ask for it.
//
// Usage (from backend/):
//   node scripts/backfill-lifetime-value.js            (dry run — no writes, shows what would change)
//   node scripts/backfill-lifetime-value.js --apply     (writes the changes)

const { Client } = require('pg');
require('dotenv').config();

async function main() {
  const apply = process.argv.includes('--apply');
  const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  console.log(`Connected. Mode: ${apply ? 'APPLY (writing changes)' : 'DRY RUN (no writes — pass --apply to write)'}\n`);

  const { rows: customers } = await client.query(`
    SELECT c.id, c.first_name, c.last_name, c.business_name, c.lifetime_value AS current_value,
      COALESCE((
        SELECT SUM(p.amount - p.refunded_amount)
        FROM payments p
        WHERE p.customer_id = c.id
          AND p.status IN ('succeeded', 'partially_refunded', 'refunded')
      ), 0) AS recalculated_value
    FROM customers c
    WHERE c.deleted_at IS NULL
    ORDER BY c.created_at ASC
  `);

  let changedCount = 0;
  let unchangedCount = 0;

  for (const c of customers) {
    const current = Number(c.current_value);
    const recalculated = Number(c.recalculated_value);
    const name = c.business_name || `${c.first_name ?? ''} ${c.last_name ?? ''}`.trim() || c.id;

    // Sub-cent float noise, not a real discrepancy.
    if (Math.abs(current - recalculated) < 0.01) {
      unchangedCount++;
      continue;
    }

    changedCount++;
    console.log(`${apply ? 'UPDATING' : 'WOULD UPDATE'}: ${name} (${c.id}) — $${current.toFixed(2)} -> $${recalculated.toFixed(2)}`);

    if (apply) {
      await client.query(`UPDATE customers SET lifetime_value = $1, updated_at = now() WHERE id = $2`, [recalculated, c.id]);
    }
  }

  console.log(`\n${changedCount} customer(s) ${apply ? 'updated' : 'would be updated'}, ${unchangedCount} already correct.`);
  if (!apply && changedCount > 0) console.log('Dry run only — re-run with --apply to write these changes.');

  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
