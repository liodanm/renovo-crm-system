// One-time population of default Service Catalog descriptions.
// Matches existing service_catalog_items rows by name (case-insensitive,
// partial match) and sets their `description` column. Only touches rows
// that already exist — never creates new services. Safe to re-run;
// running it twice just re-sets the same values.
//
// Usage (from backend/):
//   node scripts/seed-service-descriptions.js

const { Client } = require('pg');
require('dotenv').config();

const DEFAULTS = [
  { match: 'deck', description: 'Restore your deck with professional cleaning that removes dirt, mold, and mildew.' },
  { match: 'driveway', description: 'Professional pressure washing to remove oil stains, dirt, and grime from your driveway.' },
  { match: 'fence', description: 'Restore your fence to its original beauty with professional pressure washing.' },
  { match: 'house wash', description: "Complete, professional soft wash of all of the main dwelling's exterior walls and overhangs." },
  { match: 'patio', description: 'Remove dirt, mold, and algae from your patio surface.' },
  { match: 'roof', description: 'Safe soft wash cleaning to remove moss, algae, and black streaks from your roof.' },
  { match: 'walkway', description: 'Clean and brighten walkways, sidewalks, and paths around your property.' },
  { match: 'gutter', description: 'Remove debris inside, thoroughly flushing your gutters and cleaning the downspouts, preventing potential water backups and overflow.' },
  { match: 'rust', description: 'Remove rust stains from concrete, asphalt, brick, stucco, and various metals.' },
  { match: 'screen enclosure', description: 'Remove mildew and algae growth from your cage frame and screens.' },
  { match: 'window', description: 'Remove green algae, dust, mold, and cobwebs from windows.' },
  { match: 'paver', description: 'Pressure washing to remove dirt and grime from your driveway, patio, or paver surfaces.' },
];

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  console.log('Connected.\n');

  for (const { match, description } of DEFAULTS) {
    const res = await client.query(
      `UPDATE service_catalog_items SET description = $1, updated_at = now()
       WHERE LOWER(name) LIKE '%' || LOWER($2) || '%'
       RETURNING id, name`,
      [description, match],
    );
    if (res.rowCount === 0) {
      console.log(`SKIP  no service found matching "${match}" — nothing to update`);
    } else {
      res.rows.forEach((row) => console.log(`OK    "${row.name}" (${row.id}) — description set`));
    }
  }

  await client.end();
  console.log('\nDone. Any "SKIP" lines mean no matching service exists yet in your catalog — add it in Settings > Service Catalog first if you want that default description applied.');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
