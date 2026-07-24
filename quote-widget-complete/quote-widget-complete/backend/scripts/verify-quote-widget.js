#!/usr/bin/env node
// Real end-to-end verification for the Quote Widget backend (Phase 1).
// Run this against your actual deployed backend — this sandbox has no
// Postgres/Docker access, so this could not be executed here. This is
// the real test, not a substitute for one.
//
// Usage:
//   node verify-quote-widget.js https://renovo-crm-system-production.up.railway.app COMPANY_SLUG
//
// What it checks, in order:
//   1. GET  /public/:slug/quote-widget/branding   -> 200, real branding JSON
//   2. GET  /public/:slug/quote-widget/services    -> 200, at least one active service
//   3. POST /public/:slug/quote-widget/quote       -> 200, a real estimateNumber back
//   4. Re-POST the SAME body (same idempotencyKey) -> confirms idempotency:
//      same estimateNumber returned, not a second one
//   5. POST with the honeypot field filled          -> 200 { received: true },
//      confirms no estimate/customer created for that submission
//
// This does NOT inspect the database directly — pair this with a direct
// psql check (see the SQL block at the bottom of this file's output) to
// confirm RLS/company_id correctness on the rows it creates.

const [, , baseUrl, companySlug] = process.argv;

if (!baseUrl || !companySlug) {
  console.error('Usage: node verify-quote-widget.js <baseUrl> <companySlug>');
  process.exit(1);
}

const base = `${baseUrl.replace(/\/$/, '')}/api/v1/public/${companySlug}/quote-widget`;

async function main() {
  console.log(`Verifying against: ${base}\n`);

  // 1. Branding
  const brandingRes = await fetch(`${base}/branding`);
  console.log(`[1] GET /branding -> ${brandingRes.status}`);
  if (!brandingRes.ok) return fail('Branding endpoint did not return 200');
  const branding = await brandingRes.json();
  console.log('    ', JSON.stringify(branding));

  // 2. Services
  const servicesRes = await fetch(`${base}/services`);
  console.log(`[2] GET /services -> ${servicesRes.status}`);
  if (!servicesRes.ok) return fail('Services endpoint did not return 200');
  const services = await servicesRes.json();
  console.log(`     ${services.length} active service(s) found`);
  if (services.length === 0) {
    return fail('No active services found for this company — add at least one in Service Catalog before testing quote submission');
  }

  // 3. Submit a real quote
  const idempotencyKey = `verify-${Date.now()}`;
  const quotePayload = {
    firstName: 'Verification',
    lastName: 'Test',
    email: `verify-${Date.now()}@example.com`,
    phone: '5555550100',
    addressLine1: '123 Verification St',
    city: 'Testville',
    state: 'FL',
    postalCode: '33065',
    services: [{ serviceCatalogItemId: services[0].id, quantity: 500 }],
    idempotencyKey,
  };

  const submitRes = await fetch(`${base}/quote`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(quotePayload),
  });
  console.log(`[3] POST /quote -> ${submitRes.status}`);
  if (!submitRes.ok) {
    console.log('    ', await submitRes.text());
    return fail('Quote submission did not return 200');
  }
  const firstResult = await submitRes.json();
  console.log('    ', JSON.stringify(firstResult));
  if (!firstResult.estimateNumber) return fail('No estimateNumber in response');

  // 4. Idempotency check — same key, should return the SAME estimateNumber
  const retryRes = await fetch(`${base}/quote`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(quotePayload),
  });
  const retryResult = await retryRes.json();
  console.log(`[4] Retry with same idempotencyKey -> ${retryRes.status}`);
  console.log('    ', JSON.stringify(retryResult));
  if (retryResult.estimateNumber !== firstResult.estimateNumber) {
    return fail(`Idempotency FAILED — got a different estimate (${retryResult.estimateNumber}) on retry`);
  }
  console.log('     Idempotency confirmed — same estimate returned, no duplicate created.');

  // 5. Honeypot check
  const honeypotRes = await fetch(`${base}/quote`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...quotePayload, email: `honeypot-${Date.now()}@example.com`, idempotencyKey: `honeypot-${Date.now()}`, companyWebsite: 'http://spam.example.com' }),
  });
  const honeypotResult = await honeypotRes.json();
  console.log(`[5] POST with honeypot filled -> ${honeypotRes.status}`);
  console.log('    ', JSON.stringify(honeypotResult));
  if (honeypotResult.received !== true || honeypotResult.estimateNumber) {
    return fail('Honeypot did NOT silently no-op as expected');
  }

  console.log('\nAll checks passed.\n');
  console.log('--- Pair this with a direct database check ---');
  console.log(`Run this against your Postgres to confirm the created rows are correctly scoped:\n`);
  console.log(`SELECT c.id, c.email, c.source, c.created_by, e.estimate_number, e.source, e.status, e.total_amount`);
  console.log(`FROM customers c JOIN estimates e ON e.customer_id = c.id`);
  console.log(`WHERE c.email = '${quotePayload.email}';`);
  console.log(`\nExpect exactly ONE row (confirms idempotency held at the DB level too), source = 'Website Instant Quote', created_by = 'Quote Widget'.`);
}

function fail(message) {
  console.error(`\nFAILED: ${message}`);
  process.exit(1);
}

main().catch((err) => {
  console.error('Fatal error running verification:', err);
  process.exit(1);
});
