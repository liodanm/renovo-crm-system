import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { StorageService } from '../../common/storage/storage.service';

/**
 * PRODUCTION STORAGE MIGRATION — this class no longer writes to local
 * disk at all for new uploads. Every save/delete goes through the
 * already-existing, already-configured StorageService (the same real
 * S3 integration customer-files.service.ts already uses in
 * production — confirmed by finding it, not built from scratch here).
 *
 * The ONE exception, and it's read-only: any photo uploaded before
 * this migration has a storage key that only ever existed on local
 * disk (this class's previous implementation). Those keys are still
 * sitting in real Photo rows in the database — deleting or breaking
 * them was explicitly ruled out. read() tries S3 first; only on a
 * genuine "not found in S3" does it fall back to checking the legacy
 * local path, so a not-yet-backfilled old photo keeps working instead
 * of silently 404ing. See scripts/backfill-photo-storage.ts for the
 * actual migration path off this fallback — once every existing photo
 * has been copied to S3 by that script, this fallback becomes dead
 * code for real, current data (kept only as a safety net, not removed,
 * since "definitely done backfilling" isn't something to assume).
 *
 * No env-var fail-fast added here specifically — StorageService
 * already establishes this app's one convention for that (lazy
 * failure on the first real S3 call, with a "Verify Connection" check
 * available in Settings → Integrations). Photos now follow that exact
 * same convention rather than inventing a second one.
 */
@Injectable()
export class PhotoStorageService {
  private readonly logger = new Logger(PhotoStorageService.name);
  private readonly legacyLocalBaseDir = path.join(process.cwd(), 'uploads', 'photos');

  constructor(private readonly storage: StorageService) {}

  /**
   * Matches the convention requested for this migration —
   * companies/{companyId}/jobs/{jobId}/photos/{uploadId}/{variant} —
   * one shared uploadId across all three variants of a single upload,
   * same reasoning as the previous local-disk version: they're
   * trivially grouped in the bucket as the same photo instead of three
   * unrelated-looking keys. uploadId is a fresh UUID generated here,
   * not the eventual Photo row's own id — the DB row doesn't exist yet
   * at the point these keys are built (storage write happens before
   * the DB insert, so a failed insert can clean up by key alone).
   */
  buildVariantKeys(companyId: string, jobId: string, extension: string): { original: string; web: string; thumbnail: string } {
    const uploadId = randomUUID();
    const base = `companies/${companyId}/jobs/${jobId}/photos/${uploadId}`;
    return { original: `${base}/original${extension}`, web: `${base}/web.jpg`, thumbnail: `${base}/thumbnail.jpg` };
  }

  async save(key: string, buffer: Buffer, contentType: string): Promise<void> {
    await this.storage.uploadBuffer(key, buffer, contentType);
  }

  async read(key: string): Promise<Buffer> {
    try {
      return await this.storage.readObject(key);
    } catch (err) {
      // Deliberately checks THREE signals, not just one — a real,
      // documented AWS SDK v3 inconsistency (github.com/aws/aws-sdk-js-v3
      // issue #7502: "S3 Client's thrown errors not always include Code
      // and some other properties" as of certain SDK versions) means
      // relying on a single field here is a real reliability risk, not
      // theoretical. `.name` is the most consistently-populated signal
      // across SDK versions; `.Code` is the legacy v2-style field, kept
      // as a fallback; `$metadata.httpStatusCode === 404` is a third,
      // version-resilient signal confirmed present on real NoSuchKey
      // errors. Any ONE of these matching is enough to treat it as
      // "genuinely not found" — but critically, NONE of them match for
      // AccessDenied, NoSuchBucket, throttling, timeouts, or any 5xx,
      // so a real AWS problem still throws instead of silently and
      // confusingly falling back to a legacy local file that has
      // nothing to do with the actual error.
      const e = err as { name?: string; Code?: string; $metadata?: { httpStatusCode?: number } };
      const isNotFound = e?.name === 'NoSuchKey' || e?.Code === 'NoSuchKey' || e?.$metadata?.httpStatusCode === 404;
      if (!isNotFound) {
        this.logger.error(`S3 read failed for key ${key} (not a NotFound — treating as a real failure, not falling back to legacy storage): ${(err as Error).message}`);
        throw err;
      }

      const legacyPath = path.join(this.legacyLocalBaseDir, key);
      if (!legacyPath.startsWith(this.legacyLocalBaseDir)) throw new Error('Invalid storage key');
      try {
        const buffer = await fs.readFile(legacyPath);
        // The one thing Phase 13 (observability) actually asked for:
        // a visible signal that legacy fallback is STILL being used,
        // so it's possible to tell — from logs alone — when it's
        // finally safe to remove this code path entirely, rather than
        // just assuming the backfill script has caught everything.
        this.logger.warn(`Served photo from legacy local storage (not yet backfilled to S3): ${key}`);
        return buffer;
      } catch {
        throw err; // Genuinely missing in both places — surface the original S3 error.
      }
    }
  }

  async delete(key: string): Promise<void> {
    await this.storage.deleteObject(key).catch(() => undefined);
    // Best-effort legacy cleanup too, in case this exact key was ever
    // saved locally before the migration and never backfilled/deleted.
    const legacyPath = path.join(this.legacyLocalBaseDir, key);
    if (legacyPath.startsWith(this.legacyLocalBaseDir)) {
      await fs.rm(legacyPath, { force: true }).catch(() => undefined);
    }
  }
}
