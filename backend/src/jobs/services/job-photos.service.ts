import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import sharp from 'sharp';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PhotoStorageService } from './photo-storage.service';

// HEIC/HEIF removed — confirmed via current (2026) browser-compatibility
// sources: only Safari 17+ renders it natively inside an <img> tag.
// Chrome, Firefox, and Edge do not, regardless of OS-level codec
// support, so a HEIC upload would silently produce a broken image for
// most staff and virtually all customers. Per the explicit production-
// hardening direction: a clear rejection at upload time is better than
// a photo that looks broken later, in front of a customer, with no
// error anywhere. Real HEIC support would mean converting server-side
// (sharp's default libvips build does not include HEIF decode — that
// needs a separately-compiled libvips or a second library like
// heic-convert) — a genuine option for later, not implemented in this
// pass; noted as a real remaining gap, not silently dropped.
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024; // 15MB — generous for a phone camera photo, not unlimited
const VALID_PHOTO_TYPES = ['before', 'after', 'during', 'damage', 'equipment', 'other'];

// Long edge in pixels — large enough that the customer portal and Job
// Detail viewer never look soft on a modern phone/laptop screen, far
// smaller than a typical 12+ MP phone photo (often 4000px+ on the
// long edge, several MB). Thumbnail is for grid views only, never
// meant to be viewed full-screen.
const WEB_MAX_DIMENSION = 1600;
const THUMBNAIL_MAX_DIMENSION = 400;

export interface JobPhotoRow {
  id: string;
  photoType: string;
  caption: string | null;
  mimeType: string | null;
  fileSizeBytes: string | null;
  width: number | null;
  height: number | null;
  takenAt: Date | null;
  createdAt: Date;
  s3KeyOriginal: string;
  s3KeyWeb: string | null;
  s3KeyThumbnail: string | null;
}

@Injectable()
export class JobPhotosService {
  private readonly logger = new Logger(JobPhotosService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: PhotoStorageService,
  ) {}

  async listByJob(companyId: string, jobId: string): Promise<JobPhotoRow[]> {
    return this.prisma.withTenantContext(companyId, (tx) => tx.$queryRaw`
      SELECT id, photo_type AS "photoType", caption, mime_type AS "mimeType",
             file_size_bytes::text AS "fileSizeBytes", width, height,
             taken_at AS "takenAt", created_at AS "createdAt", s3_key_original AS "s3KeyOriginal",
             s3_key_web AS "s3KeyWeb", s3_key_thumbnail AS "s3KeyThumbnail"
      FROM photos
      WHERE job_id = ${jobId}::uuid AND company_id = ${companyId}::uuid
      ORDER BY COALESCE(taken_at, created_at) ASC
    `);
  }

  async upload(
    companyId: string,
    jobId: string,
    userId: string,
    file: { buffer: Buffer; mimetype: string; size: number; originalname: string },
    photoType: string,
    caption: string | undefined,
    gps: { latitude?: number; longitude?: number } | undefined,
  ): Promise<JobPhotoRow> {
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      throw new BadRequestException(
        `Unsupported file type '${file.mimetype}'. Allowed: JPEG, PNG, WebP. If this was taken on an iPhone, ` +
          `set your camera to "Most Compatible" under Settings → Camera → Formats, or choose "Actual Size" (not HEIC) when sharing/exporting.`,
      );
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      throw new BadRequestException('Photo is too large (max 15MB).');
    }
    if (!VALID_PHOTO_TYPES.includes(photoType)) {
      throw new BadRequestException(`Invalid photo type '${photoType}'.`);
    }

    // Image processing happens BEFORE any storage write — a corrupt or
    // unreadable file fails here with a clear message, never as a
    // half-saved photo. sharp's .rotate() with no arguments reads the
    // EXIF orientation tag and bakes the correct rotation into the
    // actual pixel data, THEN strips metadata as a side effect of not
    // calling .withMetadata() — this is what actually removes GPS/
    // device EXIF from the derivatives, not a separate "privacy" step.
    // The original is stored untouched (unprocessed) for staff-only
    // access; customer-facing and gallery-grid code paths use the web/
    // thumbnail derivatives, which never carry the original's metadata.
    let dimensions: { width: number; height: number };
    let webBuffer: Buffer;
    let thumbnailBuffer: Buffer;
    try {
      const pipeline = sharp(file.buffer).rotate();
      const metadata = await pipeline.metadata();
      dimensions = { width: metadata.width ?? 0, height: metadata.height ?? 0 };
      webBuffer = await sharp(file.buffer).rotate().resize({ width: WEB_MAX_DIMENSION, height: WEB_MAX_DIMENSION, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer();
      thumbnailBuffer = await sharp(file.buffer).rotate().resize({ width: THUMBNAIL_MAX_DIMENSION, height: THUMBNAIL_MAX_DIMENSION, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 78 }).toBuffer();
    } catch (err) {
      // A broken/corrupt image is rejected here rather than saved as an
      // unusable record — matches the same "clear rejection over a
      // silently broken result" principle as the HEIC check above.
      this.logger.warn(`Sharp processing failed for an upload to job ${jobId}: ${(err as Error).message}`);
      throw new BadRequestException("Couldn't process this photo. It may be corrupted or in an unsupported format.");
    }

    const extension = file.mimetype === 'image/png' ? '.png' : file.mimetype === 'image/webp' ? '.webp' : '.jpg';
    const keys = this.storage.buildVariantKeys(companyId, jobId, extension);

    // Storage-consistency fix, and a real bug caught during this exact
    // audit item: the three saves below now share ONE try/catch with
    // the DB insert that follows. Previously only the DB-insert step
    // had cleanup — if original saved successfully but web or
    // thumbnail then failed, original would have been silently
    // orphaned in S3 forever with no cleanup attempted at all. Now any
    // failure at any point in this sequence — a storage save or the DB
    // insert — cleans up every variant that succeeded before the
    // failure (delete() is already a no-op-safe/best-effort call for
    // a key that was never actually written).
    try {
      await this.storage.save(keys.original, file.buffer, file.mimetype);
      await this.storage.save(keys.web, webBuffer, 'image/jpeg');
      await this.storage.save(keys.thumbnail, thumbnailBuffer, 'image/jpeg');

      return await this.prisma.withTenantContext(companyId, async (tx) => {
        const rows = await tx.$queryRaw<JobPhotoRow[]>`
          INSERT INTO photos (company_id, job_id, uploaded_by_user_id, photo_type, s3_key_original, s3_key_web, s3_key_thumbnail, file_size_bytes, mime_type, width, height, caption, taken_at)
          VALUES (${companyId}::uuid, ${jobId}::uuid, ${userId}::uuid, ${photoType}, ${keys.original}, ${keys.web}, ${keys.thumbnail}, ${file.size}, ${file.mimetype}, ${dimensions.width}, ${dimensions.height}, ${caption ?? null}, now())
          RETURNING id, photo_type AS "photoType", caption, mime_type AS "mimeType",
             file_size_bytes::text AS "fileSizeBytes", width, height,
             taken_at AS "takenAt", created_at AS "createdAt", s3_key_original AS "s3KeyOriginal",
             s3_key_web AS "s3KeyWeb", s3_key_thumbnail AS "s3KeyThumbnail"
        `;
        const created = rows[0];
        await tx.$executeRaw`
          INSERT INTO job_audit_log (company_id, job_id, action_type, performed_by_user_id, latitude, longitude, new_value)
          VALUES (${companyId}::uuid, ${jobId}::uuid, 'photo_added', ${userId}::uuid, ${gps?.latitude ?? null}, ${gps?.longitude ?? null}, ${JSON.stringify({ id: created.id, photoType })}::jsonb)
        `;
        return created;
      });
    } catch (err) {
      this.logger.error(`Photo upload failed for job ${jobId}, cleaning up any storage objects already written: ${(err as Error).message}`);
      await Promise.all([
        this.storage.delete(keys.original).catch(() => undefined),
        this.storage.delete(keys.web).catch(() => undefined),
        this.storage.delete(keys.thumbnail).catch(() => undefined),
      ]);
      throw err;
    }
  }

  /**
   * `variant` defaults to 'web' — the optimized, metadata-stripped
   * derivative — for every caller that doesn't explicitly ask for the
   * original. This is the actual privacy fix: PortalDataService's
   * customer-facing method never requests 'original', so a customer
   * can never receive the raw file's embedded GPS/EXIF even if it
   * were somehow present, because they're never served that file at
   * all. Falls back to the original when a requested derivative
   * doesn't exist — real for any photo uploaded before this change
   * shipped (s3KeyWeb/s3KeyThumbnail are null on those rows).
   */
  async getFile(companyId: string, jobId: string, photoId: string, variant: 'original' | 'web' | 'thumbnail' = 'web'): Promise<{ buffer: Buffer; mimeType: string | null }> {
    const rows: { s3KeyOriginal: string; s3KeyWeb: string | null; s3KeyThumbnail: string | null; mimeType: string | null }[] = await this.prisma.withTenantContext(companyId, (tx) => tx.$queryRaw`
      SELECT s3_key_original AS "s3KeyOriginal", s3_key_web AS "s3KeyWeb", s3_key_thumbnail AS "s3KeyThumbnail", mime_type AS "mimeType"
      FROM photos WHERE id = ${photoId}::uuid AND job_id = ${jobId}::uuid AND company_id = ${companyId}::uuid
    `);
    if (rows.length === 0) throw new NotFoundException('Photo not found');
    const photo = rows[0];

    if (variant === 'original') {
      const buffer = await this.storage.read(photo.s3KeyOriginal);
      return { buffer, mimeType: photo.mimeType };
    }

    // Real privacy requirement, not just a performance nicety: a photo
    // uploaded before this Sharp pipeline existed has no web/thumbnail
    // derivative yet. The OLD behavior fell back to serving the
    // original in that case — which could still carry the source
    // phone photo's embedded EXIF/GPS straight to a customer. Silently
    // doing that again here would undo the entire point of this
    // migration. Instead: generate the missing derivative from the
    // original right now, through the exact same sharp pipeline
    // upload() already uses (auto-rotate, resize, re-encode without
    // metadata), persist it to S3 and back to the Photo row so this
    // photo never needs to be regenerated again, and serve THAT —
    // never the original — regardless of whether this is the first
    // view or the thousandth.
    const existingKey = variant === 'web' ? photo.s3KeyWeb : photo.s3KeyThumbnail;
    if (existingKey) {
      const buffer = await this.storage.read(existingKey);
      return { buffer, mimeType: 'image/jpeg' };
    }

    const originalBuffer = await this.storage.read(photo.s3KeyOriginal);
    const maxDimension = variant === 'web' ? WEB_MAX_DIMENSION : THUMBNAIL_MAX_DIMENSION;
    const quality = variant === 'web' ? 82 : 78;
    const derivativeBuffer = await sharp(originalBuffer).rotate().resize({ width: maxDimension, height: maxDimension, fit: 'inside', withoutEnlargement: true }).jpeg({ quality }).toBuffer();

    // Deliberately NOT derived by string-manipulating photo.s3KeyOriginal
    // — a photo from before this S3 migration has a completely
    // different key shape (no /original segment to replace at all),
    // and naively assuming the new format could silently compute a key
    // identical to the original's, overwriting it. A fresh,
    // independent key sidesteps that entirely, regardless of what
    // format the existing original's key happens to be in.
    const derivativeKeys = this.storage.buildVariantKeys(companyId, jobId, '.jpg');
    const derivativeKey = variant === 'web' ? derivativeKeys.web : derivativeKeys.thumbnail;
    await this.storage.save(derivativeKey, derivativeBuffer, 'image/jpeg');
    const column = variant === 'web' ? 's3_key_web' : 's3_key_thumbnail';
    await this.prisma.withTenantContext(companyId, (tx) => tx.$executeRawUnsafe(
      `UPDATE photos SET ${column} = $1 WHERE id = $2::uuid AND company_id = $3::uuid`,
      derivativeKey, photoId, companyId,
    ));
    // Observability, per the explicit ask: this is the one signal that
    // tells you an old, pre-migration photo was just self-healed —
    // useful both to confirm the mechanism is actually firing in
    // production, and as a rough proxy for "how many old photos are
    // still out there" without needing a full metrics platform.
    this.logger.log(`Generated missing ${variant} derivative on-demand for photo ${photoId} (job ${jobId})`);

    return { buffer: derivativeBuffer, mimeType: 'image/jpeg' };
  }

  async delete(companyId: string, jobId: string, photoId: string, userId: string, gps?: { latitude?: number; longitude?: number }) {
    const rows: JobPhotoRow[] = await this.prisma.withTenantContext(companyId, (tx) => tx.$queryRaw`
      SELECT id, photo_type AS "photoType", caption, mime_type AS "mimeType",
             file_size_bytes::text AS "fileSizeBytes", width, height,
             taken_at AS "takenAt", created_at AS "createdAt", s3_key_original AS "s3KeyOriginal",
             s3_key_web AS "s3KeyWeb", s3_key_thumbnail AS "s3KeyThumbnail"
      FROM photos WHERE id = ${photoId}::uuid AND job_id = ${jobId}::uuid AND company_id = ${companyId}::uuid
    `);
    if (rows.length === 0) throw new NotFoundException('Photo not found');
    const photo = rows[0];

    return this.prisma.withTenantContext(companyId, async (tx) => {
      await tx.$executeRaw`DELETE FROM photos WHERE id = ${photoId}::uuid AND company_id = ${companyId}::uuid`;
      await tx.$executeRaw`
        INSERT INTO job_audit_log (company_id, job_id, action_type, performed_by_user_id, latitude, longitude, previous_value)
        VALUES (${companyId}::uuid, ${jobId}::uuid, 'photo_deleted', ${userId}::uuid, ${gps?.latitude ?? null}, ${gps?.longitude ?? null}, ${JSON.stringify({ id: photo.id, photoType: photo.photoType })}::jsonb)
      `;
      // Best-effort: the DB row is already gone and is the source of
      // truth, so a storage-delete failure here shouldn't fail the
      // request — it would just leave an orphaned file, not a
      // dangling/broken reference. All three variants are cleaned up,
      // not just the original.
      await Promise.all([
        this.storage.delete(photo.s3KeyOriginal).catch(() => undefined),
        photo.s3KeyWeb ? this.storage.delete(photo.s3KeyWeb).catch(() => undefined) : Promise.resolve(),
        photo.s3KeyThumbnail ? this.storage.delete(photo.s3KeyThumbnail).catch(() => undefined) : Promise.resolve(),
      ]);
      return { success: true };
    });
  }
}
