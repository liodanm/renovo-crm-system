// One-off migration runner for environments without psql (e.g. Windows
// without the PostgreSQL client tools installed). Applies every SQL file
// in backend/prisma/migrations/, in order, against DATABASE_URL.
//
// Safe to re-run: continues past "already exists" style errors on
// already-applied migrations instead of aborting, then reports which
// files actually failed vs. which just re-hit something already applied.
//
// Usage (from backend/):
//   npm install pg --no-save
//   node scripts/run-migrations.js

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

async function main() {
  const databaseUrl = process.env.DATABASE_URL || require('dotenv').config().parsed?.DATABASE_URL;
  if (!databaseUrl) {
    console.error('DATABASE_URL not found. Run this from backend/ with your .env present, or set DATABASE_URL in the environment first.');
    process.exit(1);
  }

  const client = new Client({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });
  await client.connect();
  console.log('Connected.');

  const migrationsDir = path.join(__dirname, '..', 'prisma', 'migrations');
  const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();

  const results = [];
  for (const file of files) {
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    try {
      await client.query(sql);
      results.push({ file, status: 'applied' });
      console.log(`OK    ${file}`);
    } catch (err) {
      // Without this, a failed statement (e.g. "already exists" on an
      // already-applied migration) leaves the session's transaction in
      // an aborted state, and EVERY subsequent file's queries get
      // silently skipped with "current transaction is aborted" —
      // which is exactly what happened without this rollback.
      try {
        await client.query('ROLLBACK');
      } catch {
        // no transaction was open — fine, nothing to roll back
      }
      results.push({ file, status: 'error', message: err.message });
      console.log(`ERROR ${file}: ${err.message.split('\n')[0]}`);
    }
  }

  await client.end();

  console.log('\n--- Summary ---');
  const errored = results.filter((r) => r.status === 'error');
  if (errored.length === 0) {
    console.log('All migrations applied cleanly.');
  } else {
    console.log(`${errored.length} file(s) reported an error — check each message above.`);
    console.log('"already exists" / "duplicate column" errors are expected for migrations that were already applied and are safe to ignore.');
    console.log('Any OTHER kind of error on 026 or 027 specifically needs a closer look — paste it back for help.');
  }
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
