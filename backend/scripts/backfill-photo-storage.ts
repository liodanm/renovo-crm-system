/**
 * Photo derivative backfill — run manually, never automatically.
 *
 * WHAT THIS DOES
 * Finds every Photo row missing a web derivative (s3_key_web IS NULL —
 * the signal that a photo predates the Sharp/S3 pipeline), reads its
 * original from storage (S3 first, falling back to legacy local disk
 * via PhotoStorageService's own built-in fallback — see that file),
 * generates web + thumbnail derivatives through the exact same sharp
 * pipeline JobPhotosService.upload() uses, uploads them to S3, and
 * updates the row.
 *
 * WHY THIS IS SAFE TO RUN REPEATEDLY
 * - Idempotent: only selects rows where s3_key_web IS NULL, so an
 *   already-backfilled photo is never touched again, run after run.
 * - Non-destructive: never deletes or overwrites the original. Only
 *   ever ADDS s3_key_web/s3_key_thumbnail/width/height to a row that's
 *   missing them.
 * - Retryable: one photo's failure (corrupt original, transient S3
 *   error) is caught and logged; every other photo in the batch still
 *   gets processed. Re-running picks up exactly the photos that
 *   failed last time (they're still missing s3_key_web) and skips
 *   everything that already succeeded.
 * - Tenant-safe: every read/write goes through the same
 *   withTenantContext(companyId, ...) as the rest of the app; the
 *   query itself is not scoped to one company deliberately (this is
 *   an internal maintenance script processing all tenants' historical
 *   data, not a customer-facing or per-request code path), but each
 *   individual row's operations still execute inside that row's own
 *   companyId's tenant context, never a cross-tenant operation.
 *
 * HOW TO RUN
 *   cd backend
 *   npx ts-node -r tsconfig-paths/register scripts/backfill-photo-storage.ts --dry-run   # report only, writes nothing
 *   npx ts-node -r tsconfig-paths/register scripts/backfill-photo-storage.ts             # the real thing
 *
 * or after building:
 *   node dist/scripts/backfill-photo-storage.js
 *
 * Reports a final summary: total found, succeeded, failed (with each
 * failed photo's id and error message so a human can look at exactly
 * those, rather than the whole batch).
 */
import { NestFactory } from '@nestjs/core';
import sharp from 'sharp';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { PhotoStorageService } from '../src/jobs/services/photo-storage.service';

const WEB_MAX_DIMENSION = 1600;
const THUMBNAIL_MAX_DIMENSION = 400;

interface PhotoToBackfill {
  id: string;
  companyId: string;
  jobId: string;
  s3KeyOriginal: string;
}

async function main() {
  // --dry-run: does everything EXCEPT the two writes (S3 upload + DB
  // update) — reads the original, runs it through the real sharp
  // pipeline, reports what WOULD happen, and touches nothing. Exists
  // specifically so this can be run against real production data
  // first, to see real success/failure counts and messages, before
  // committing to an actual write.
  const dryRun = process.argv.includes('--dry-run');

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn', 'log'] });
  const prisma = app.get(PrismaService);
  const storage = app.get(PhotoStorageService);

  console.log(`Photo derivative backfill${dryRun ? ' (DRY RUN — no writes will be made)' : ''} — finding photos missing a web derivative...`);

  const rows: PhotoToBackfill[] = await prisma.$queryRaw`
    SELECT id, company_id AS "companyId", job_id AS "jobId", s3_key_original AS "s3KeyOriginal"
    FROM photos
    WHERE s3_key_web IS NULL AND job_id IS NOT NULL
    ORDER BY created_at ASC
  `;

  console.log(`Found ${rows.length} photo(s) to process.\n`);

  let succeeded = 0;
  const failures: { id: string; error: string }[] = [];

  for (const photo of rows) {
    try {
      const originalBuffer = await storage.read(photo.s3KeyOriginal);

      const metadata = await sharp(originalBuffer).rotate().metadata();
      const webBuffer = await sharp(originalBuffer).rotate().resize({ width: WEB_MAX_DIMENSION, height: WEB_MAX_DIMENSION, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer();
      const thumbnailBuffer = await sharp(originalBuffer).rotate().resize({ width: THUMBNAIL_MAX_DIMENSION, height: THUMBNAIL_MAX_DIMENSION, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 78 }).toBuffer();

      if (dryRun) {
        succeeded++;
        console.log(`  ✓ (dry run) ${photo.id} — would generate ${webBuffer.length}-byte web + ${thumbnailBuffer.length}-byte thumbnail, ${metadata.width}x${metadata.height}`);
        continue;
      }

      const keys = storage.buildVariantKeys(photo.companyId, photo.jobId, '.jpg');
      await storage.save(keys.web, webBuffer, 'image/jpeg');
      await storage.save(keys.thumbnail, thumbnailBuffer, 'image/jpeg');

      await prisma.withTenantContext(photo.companyId, (tx) => tx.$executeRaw`
        UPDATE photos
        SET s3_key_web = ${keys.web}, s3_key_thumbnail = ${keys.thumbnail}, width = ${metadata.width ?? null}, height = ${metadata.height ?? null}
        WHERE id = ${photo.id}::uuid AND company_id = ${photo.companyId}::uuid
      `);

      succeeded++;
      console.log(`  ✓ ${photo.id}`);
    } catch (err) {
      failures.push({ id: photo.id, error: (err as Error).message });
      console.log(`  ✗ ${photo.id} — ${(err as Error).message}`);
    }
  }

  console.log(`\nDone. ${succeeded}/${rows.length} succeeded.`);
  if (failures.length > 0) {
    console.log(`\n${failures.length} failure(s) — re-run this script to retry just these (they still lack a web derivative):`);
    failures.forEach((f) => console.log(`  ${f.id}: ${f.error}`));
  }

  await app.close();
  process.exit(failures.length > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Backfill script failed to start:', err);
  process.exit(1);
});
