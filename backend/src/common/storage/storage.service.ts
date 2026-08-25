import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand, HeadBucketCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';

/**
 * Every key is prefixed with the tenant's companyId — this is a second,
 * independent layer of tenant isolation on top of RLS (which protects the
 * *metadata* rows in Postgres, not the S3 objects themselves). A presigned
 * URL is only ever generated for a key under the CALLER's own companyId
 * prefix; see the callers in customer-files.service.ts.
 */
@Injectable()
export class StorageService {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly cdnBaseUrl: string | undefined;

  constructor(private readonly config: ConfigService) {
    this.bucket = this.config.get<string>('AWS_S3_BUCKET', 'renovo-media');
    this.cdnBaseUrl = this.config.get<string>('AWS_CLOUDFRONT_URL');
    this.client = new S3Client({
      region: this.config.get<string>('AWS_REGION', 'us-east-1'),
      // Credentials resolved from the standard AWS credential chain
      // (env vars / IAM role) — never hardcoded here.
    });
  }

  buildKey(companyId: string, category: 'photos' | 'documents' | 'branding', originalFileName: string): string {
    const ext = originalFileName.includes('.') ? originalFileName.split('.').pop() : undefined;
    const uniqueName = `${randomUUID()}${ext ? `.${ext}` : ''}`;
    return `${companyId}/${category}/${uniqueName}`;
  }

  async getPresignedUploadUrl(key: string, contentType: string, expiresInSeconds = 300): Promise<string> {
    const command = new PutObjectCommand({ Bucket: this.bucket, Key: key, ContentType: contentType });
    return getSignedUrl(this.client, command, { expiresIn: expiresInSeconds });
  }

  async getPresignedDownloadUrl(key: string, expiresInSeconds = 900): Promise<string> {
    const command = new GetObjectCommand({ Bucket: this.bucket, Key: key });
    return getSignedUrl(this.client, command, { expiresIn: expiresInSeconds });
  }

  /** Prefer this over a signed URL when the bucket has a CDN in front of it (production default). */
  getPublicUrl(key: string): string {
    return this.cdnBaseUrl ? `${this.cdnBaseUrl}/${key}` : `https://${this.bucket}.s3.amazonaws.com/${key}`;
  }

  async deleteObject(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  /**
   * Server-side upload for data the backend itself produces (e.g. a
   * signature converted from a base64 data URL), as opposed to
   * getPresignedUploadUrl() above, which is for a browser uploading
   * directly. Same PutObjectCommand this class already uses internally
   * in testUploadRoundTrip() — not a new upload mechanism, just the
   * first time it's exposed as a reusable method instead of being
   * inlined for that one diagnostic use.
   */
  async uploadBuffer(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType }));
  }

  getConfig(): { bucket: string; region: string } {
    return { bucket: this.bucket, region: this.config.get<string>('AWS_REGION', 'us-east-1') };
  }

  /** Confirms the bucket exists and is reachable with the current credentials — no object read/write. Used by "Verify Connection". */
  async verifyConnection(): Promise<{ ok: boolean; error?: string }> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
      return { ok: true };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }

  /** A real put+delete round trip against the configured bucket — what "Upload Test File" on the Integrations page actually exercises. */
  async testUploadRoundTrip(companyId: string): Promise<{ ok: boolean; error?: string }> {
    const key = `${companyId}/_integration-test/${randomUUID()}.txt`;
    try {
      await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: 'Renovo CRM storage integration test', ContentType: 'text/plain' }));
      await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
      return { ok: true };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }
}
