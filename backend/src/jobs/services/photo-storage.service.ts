import { Injectable } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';
import { randomUUID } from 'crypto';

/**
 * The `photos` table's s3_key_original/s3_key_thumbnail/s3_key_web
 * columns were already designed for real cloud storage (per the
 * original schema) — this class is the one piece standing in for a real
 * S3 (or equivalent) integration until AWS credentials exist. Every key
 * this returns is a logical path, exactly the shape an S3 key would be
 * ("jobs/{jobId}/{uuid}.jpg"), stored under a local uploads directory
 * for now.
 *
 * Swapping to real cloud storage later means replacing save/read/delete
 * here with S3 SDK calls — nothing about the schema, the API contract,
 * or any calling service changes.
 */
@Injectable()
export class PhotoStorageService {
  private readonly baseDir = path.join(process.cwd(), 'uploads', 'photos');

  buildKey(companyId: string, jobId: string, extension: string): string {
    return `${companyId}/jobs/${jobId}/${randomUUID()}${extension}`;
  }

  private resolvePath(key: string): string {
    // Defends against a key containing '..' escaping the uploads dir —
    // keys are server-generated via buildKey, but a defensive check
    // here costs nothing and closes off a real path-traversal class of
    // bug if that ever changes.
    const resolved = path.join(this.baseDir, key);
    if (!resolved.startsWith(this.baseDir)) {
      throw new Error('Invalid storage key');
    }
    return resolved;
  }

  async save(key: string, buffer: Buffer): Promise<void> {
    const filePath = this.resolvePath(key);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, buffer);
  }

  async read(key: string): Promise<Buffer> {
    return fs.readFile(this.resolvePath(key));
  }

  async delete(key: string): Promise<void> {
    await fs.rm(this.resolvePath(key), { force: true });
  }
}
