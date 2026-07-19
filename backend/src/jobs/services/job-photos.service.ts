import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PhotoStorageService } from './photo-storage.service';

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'];
const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024; // 15MB — generous for a phone camera photo, not unlimited
const VALID_PHOTO_TYPES = ['before', 'after', 'during', 'damage', 'equipment', 'other'];

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
}

@Injectable()
export class JobPhotosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: PhotoStorageService,
  ) {}

  async listByJob(companyId: string, jobId: string): Promise<JobPhotoRow[]> {
    return this.prisma.withTenantContext(companyId, (tx) => tx.$queryRaw`
      SELECT id, photo_type AS "photoType", caption, mime_type AS "mimeType",
             file_size_bytes::text AS "fileSizeBytes", width, height,
             taken_at AS "takenAt", created_at AS "createdAt", s3_key_original AS "s3KeyOriginal"
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
      throw new BadRequestException(`Unsupported file type '${file.mimetype}'. Allowed: JPEG, PNG, WebP, HEIC.`);
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      throw new BadRequestException('Photo is too large (max 15MB).');
    }
    if (!VALID_PHOTO_TYPES.includes(photoType)) {
      throw new BadRequestException(`Invalid photo type '${photoType}'.`);
    }

    const extension = file.mimetype === 'image/png' ? '.png' : file.mimetype === 'image/webp' ? '.webp' : file.mimetype === 'image/heic' ? '.heic' : '.jpg';
    const key = this.storage.buildKey(companyId, jobId, extension);
    await this.storage.save(key, file.buffer);

    return this.prisma.withTenantContext(companyId, async (tx) => {
      const rows = await tx.$queryRaw<JobPhotoRow[]>`
        INSERT INTO photos (company_id, job_id, uploaded_by_user_id, photo_type, s3_key_original, file_size_bytes, mime_type, caption, taken_at)
        VALUES (${companyId}::uuid, ${jobId}::uuid, ${userId}::uuid, ${photoType}, ${key}, ${file.size}, ${file.mimetype}, ${caption ?? null}, now())
        RETURNING id, photo_type AS "photoType", caption, mime_type AS "mimeType",
                  file_size_bytes::text AS "fileSizeBytes", width, height,
                  taken_at AS "takenAt", created_at AS "createdAt", s3_key_original AS "s3KeyOriginal"
      `;
      const created = rows[0];
      await tx.$executeRaw`
        INSERT INTO job_audit_log (company_id, job_id, action_type, performed_by_user_id, latitude, longitude, new_value)
        VALUES (${companyId}::uuid, ${jobId}::uuid, 'photo_added', ${userId}::uuid, ${gps?.latitude ?? null}, ${gps?.longitude ?? null}, ${JSON.stringify({ id: created.id, photoType })}::jsonb)
      `;
      return created;
    });
  }

  async getFile(companyId: string, jobId: string, photoId: string): Promise<{ buffer: Buffer; mimeType: string | null }> {
    const rows: { s3KeyOriginal: string; mimeType: string | null }[] = await this.prisma.withTenantContext(companyId, (tx) => tx.$queryRaw`
      SELECT s3_key_original AS "s3KeyOriginal", mime_type AS "mimeType"
      FROM photos WHERE id = ${photoId}::uuid AND job_id = ${jobId}::uuid AND company_id = ${companyId}::uuid
    `);
    if (rows.length === 0) throw new NotFoundException('Photo not found');
    const buffer = await this.storage.read(rows[0].s3KeyOriginal);
    return { buffer, mimeType: rows[0].mimeType };
  }

  async delete(companyId: string, jobId: string, photoId: string, userId: string, gps?: { latitude?: number; longitude?: number }) {
    const rows: JobPhotoRow[] = await this.prisma.withTenantContext(companyId, (tx) => tx.$queryRaw`
      SELECT id, photo_type AS "photoType", caption, mime_type AS "mimeType",
             file_size_bytes::text AS "fileSizeBytes", width, height,
             taken_at AS "takenAt", created_at AS "createdAt", s3_key_original AS "s3KeyOriginal"
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
      // dangling/broken reference.
      await this.storage.delete(photo.s3KeyOriginal).catch(() => undefined);
      return { success: true };
    });
  }
}
