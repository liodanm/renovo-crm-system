import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { StorageService } from '../../common/storage/storage.service';
import { PresignDocumentUploadDto, PresignPhotoUploadDto } from '../dto/presign-upload.dto';

@Injectable()
export class CustomerFilesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  // ===========================================================================
  // Photos — two-step flow: (1) client asks for a presigned PUT url and gets
  // a key back, (2) client uploads bytes directly to S3, (3) client calls
  // confirmUpload with that same key to create the metadata row. The API
  // server never touches the image bytes.
  // ===========================================================================

  async presignPhotoUpload(companyId: string, customerId: string, dto: PresignPhotoUploadDto) {
    await this.assertCustomerExists(companyId, customerId);
    const key = this.storage.buildKey(companyId, 'photos', dto.fileName);
    const uploadUrl = await this.storage.getPresignedUploadUrl(key, dto.mimeType);
    return { uploadUrl, key, expiresInSeconds: 300 };
  }

  async confirmPhotoUpload(
    companyId: string,
    customerId: string,
    uploadedByUserId: string,
    input: { key: string; photoType?: string; fileSizeBytes?: number; mimeType?: string },
  ) {
    await this.assertCustomerExists(companyId, customerId);
    this.assertKeyBelongsToCompany(companyId, input.key);

    return this.prisma.photo.create({
      data: {
        companyId,
        customerId,
        uploadedByUserId,
        photoType: input.photoType ?? 'other',
        s3KeyOriginal: input.key,
        mimeType: input.mimeType,
        fileSizeBytes: input.fileSizeBytes ? BigInt(input.fileSizeBytes) : undefined,
      },
    });
  }

  async listPhotos(companyId: string, customerId: string) {
    await this.assertCustomerExists(companyId, customerId);
    const photos = await this.prisma.photo.findMany({ where: { companyId, customerId }, orderBy: { createdAt: 'desc' } });
    return Promise.all(
      photos.map(async (p) => ({
        id: p.id,
        photoType: p.photoType,
        url: await this.storage.getPresignedDownloadUrl(p.s3KeyOriginal),
        createdAt: p.createdAt,
      })),
    );
  }

  async deletePhoto(companyId: string, customerId: string, photoId: string) {
    const photo = await this.prisma.photo.findFirst({ where: { id: photoId, companyId, customerId } });
    if (!photo) throw new NotFoundException('Photo not found');
    await this.storage.deleteObject(photo.s3KeyOriginal);
    await this.prisma.photo.delete({ where: { id: photoId } });
    return { message: 'Photo deleted' };
  }

  // ===========================================================================
  // Documents — same presigned pattern
  // ===========================================================================

  async presignDocumentUpload(companyId: string, customerId: string, dto: PresignDocumentUploadDto) {
    await this.assertCustomerExists(companyId, customerId);
    const key = this.storage.buildKey(companyId, 'documents', dto.fileName);
    const uploadUrl = await this.storage.getPresignedUploadUrl(key, dto.mimeType);
    return { uploadUrl, key, expiresInSeconds: 300 };
  }

  async confirmDocumentUpload(
    companyId: string,
    customerId: string,
    uploadedByUserId: string,
    input: { key: string; fileName: string; documentType?: string; fileSizeBytes?: number; mimeType?: string },
  ) {
    await this.assertCustomerExists(companyId, customerId);
    this.assertKeyBelongsToCompany(companyId, input.key);

    return this.prisma.document.create({
      data: {
        companyId,
        customerId,
        uploadedByUserId,
        fileName: input.fileName,
        documentType: input.documentType ?? 'other',
        s3Key: input.key,
        mimeType: input.mimeType,
        fileSizeBytes: input.fileSizeBytes ? BigInt(input.fileSizeBytes) : undefined,
      },
    });
  }

  async listDocuments(companyId: string, customerId: string) {
    await this.assertCustomerExists(companyId, customerId);
    const documents = await this.prisma.document.findMany({ where: { companyId, customerId }, orderBy: { createdAt: 'desc' } });
    return Promise.all(
      documents.map(async (d) => ({
        id: d.id,
        fileName: d.fileName,
        documentType: d.documentType,
        url: await this.storage.getPresignedDownloadUrl(d.s3Key),
        createdAt: d.createdAt,
      })),
    );
  }

  async deleteDocument(companyId: string, customerId: string, documentId: string) {
    const document = await this.prisma.document.findFirst({ where: { id: documentId, companyId, customerId } });
    if (!document) throw new NotFoundException('Document not found');
    await this.storage.deleteObject(document.s3Key);
    await this.prisma.document.delete({ where: { id: documentId } });
    return { message: 'Document deleted' };
  }

  // ===========================================================================
  // Helpers
  // ===========================================================================

  /**
   * Defense-in-depth: even though `buildKey` always generates keys under
   * the caller's own companyId prefix, this guards against a client
   * fabricating a `key` for confirmUpload that points at another tenant's
   * prefix — without this check, a malicious client could register S3
   * metadata (not bytes, since PUT itself is still presigned per-key) for
   * an object outside its own tenant boundary.
   */
  private assertKeyBelongsToCompany(companyId: string, key: string) {
    if (!key.startsWith(`${companyId}/`)) {
      throw new NotFoundException('Invalid upload key');
    }
  }

  private async assertCustomerExists(companyId: string, customerId: string) {
    const customer = await this.prisma.customer.findFirst({ where: { id: customerId, companyId, deletedAt: null } });
    if (!customer) throw new NotFoundException('Customer not found');
  }
}
