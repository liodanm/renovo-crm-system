import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { CustomersService } from './services/customers.service';
import { CustomerNotesService } from './services/customer-notes.service';
import { CustomerPropertiesService } from './services/customer-properties.service';
import { CustomerFilesService } from './services/customer-files.service';
import { CustomerImportExportService } from './services/customer-import-export.service';
import { CustomFieldsService } from './services/custom-fields.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { QueryCustomersDto } from './dto/query-customers.dto';
import { CreateNoteDto, UpdateNoteDto } from './dto/note.dto';
import { CreatePropertyDto, UpdatePropertyDto } from './dto/property.dto';
import { PresignDocumentUploadDto, PresignPhotoUploadDto } from './dto/presign-upload.dto';
import { SetCustomFieldValuesDto } from './dto/custom-field.dto';
import { BulkDeleteCustomersDto } from './dto/bulk-delete-customers.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { AuthenticatedRequestUser } from '../auth/interfaces/jwt-payload.interface';

@Controller('customers')
@RequirePermissions('customers.read') // baseline for the whole controller; write ops layer 'customers.write' on top per-route below
export class CustomersController {
  constructor(
    private readonly customersService: CustomersService,
    private readonly notesService: CustomerNotesService,
    private readonly propertiesService: CustomerPropertiesService,
    private readonly filesService: CustomerFilesService,
    private readonly importExportService: CustomerImportExportService,
    private readonly customFieldsService: CustomFieldsService,
  ) {}

  // ===========================================================================
  // Static routes FIRST — must be declared before ':id' or Nest/Express will
  // try to match "export"/"duplicates"/"import" as a customer id.
  // ===========================================================================

  @Get('duplicates')
  scanDuplicates(@CurrentUser() user: AuthenticatedRequestUser) {
    return this.customersService.scanDuplicateClusters(user.companyId);
  }

  @Post('check-duplicate')
  checkDuplicate(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Body() body: { email?: string; phone?: string; firstName?: string; lastName?: string; businessName?: string },
  ) {
    return this.customersService.checkDuplicates(user.companyId, body);
  }

  @Get('export')
  @Header('Content-Type', 'text/csv')
  async export(@CurrentUser() user: AuthenticatedRequestUser, @Res() res: Response) {
    const csv = await this.importExportService.exportToCsv(user.companyId);
    res.setHeader('Content-Disposition', `attachment; filename="customers-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(csv);
  }

  @RequirePermissions('customers.write')
  @Post('import')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } })) // 10MB cap
  importCsv(@CurrentUser() user: AuthenticatedRequestUser, @UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('No file uploaded (expected multipart field "file")');
    return this.importExportService.importFromCsv(user.companyId, user.userId, file.buffer);
  }

  // ===========================================================================
  // Core CRUD
  // ===========================================================================

  @Get()
  list(@CurrentUser() user: AuthenticatedRequestUser, @Query() query: QueryCustomersDto) {
    return this.customersService.list(user.companyId, query);
  }

  @RequirePermissions('customers.write')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@CurrentUser() user: AuthenticatedRequestUser, @Body() dto: CreateCustomerDto) {
    return this.customersService.create(user.companyId, user.userId, dto);
  }

  @Get(':id')
  getProfile(@CurrentUser() user: AuthenticatedRequestUser, @Param('id') id: string) {
    return this.customersService.getProfile(user.companyId, id);
  }

  @RequirePermissions('customers.write')
  @Patch(':id')
  update(@CurrentUser() user: AuthenticatedRequestUser, @Param('id') id: string, @Body() dto: UpdateCustomerDto) {
    return this.customersService.update(user.companyId, id, dto);
  }

  @RequirePermissions('customers.write')
  @Post('bulk-delete')
  bulkDelete(@CurrentUser() user: AuthenticatedRequestUser, @Body() dto: BulkDeleteCustomersDto) {
    return this.customersService.bulkSoftDelete(user.companyId, dto.ids);
  }

  @RequirePermissions('customers.write')
  @Delete(':id')
  delete(@CurrentUser() user: AuthenticatedRequestUser, @Param('id') id: string) {
    return this.customersService.softDelete(user.companyId, id);
  }

  @RequirePermissions('customers.write')
  @Post(':id/merge/:duplicateId')
  merge(@CurrentUser() user: AuthenticatedRequestUser, @Param('id') id: string, @Param('duplicateId') duplicateId: string) {
    return this.customersService.merge(user.companyId, id, duplicateId);
  }

  @Get(':id/service-history')
  getServiceHistory(@CurrentUser() user: AuthenticatedRequestUser, @Param('id') id: string) {
    return this.customersService.getServiceHistory(user.companyId, id);
  }

  @RequirePermissions('customers.write')
  @Post(':id/mark-review-received')
  markReviewReceived(@CurrentUser() user: AuthenticatedRequestUser, @Param('id') id: string) {
    return this.customersService.markReviewReceived(user.companyId, id);
  }

  @Get(':id/activity')
  getActivity(@CurrentUser() user: AuthenticatedRequestUser, @Param('id') id: string) {
    return this.customersService.getActivityTimeline(user.companyId, id);
  }

  // ===========================================================================
  // Properties
  // ===========================================================================

  @Get(':id/properties')
  listProperties(@CurrentUser() user: AuthenticatedRequestUser, @Param('id') id: string) {
    return this.propertiesService.list(user.companyId, id);
  }

  @RequirePermissions('customers.write')
  @Post(':id/properties')
  @HttpCode(HttpStatus.CREATED)
  createProperty(@CurrentUser() user: AuthenticatedRequestUser, @Param('id') id: string, @Body() dto: CreatePropertyDto) {
    return this.propertiesService.create(user.companyId, id, dto);
  }

  @RequirePermissions('customers.write')
  @Patch(':id/properties/:propertyId')
  updateProperty(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Param('id') id: string,
    @Param('propertyId') propertyId: string,
    @Body() dto: UpdatePropertyDto,
  ) {
    return this.propertiesService.update(user.companyId, id, propertyId, dto);
  }

  @RequirePermissions('customers.write')
  @Delete(':id/properties/:propertyId')
  deleteProperty(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Param('id') id: string,
    @Param('propertyId') propertyId: string,
  ) {
    return this.propertiesService.delete(user.companyId, id, propertyId);
  }

  // ===========================================================================
  // Notes
  // ===========================================================================

  @Get(':id/notes')
  listNotes(@CurrentUser() user: AuthenticatedRequestUser, @Param('id') id: string) {
    return this.notesService.list(user.companyId, id);
  }

  @Post(':id/notes')
  @HttpCode(HttpStatus.CREATED)
  createNote(@CurrentUser() user: AuthenticatedRequestUser, @Param('id') id: string, @Body() dto: CreateNoteDto) {
    return this.notesService.create(user.companyId, id, user.userId, dto);
  }

  @Patch(':id/notes/:noteId')
  updateNote(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Param('id') id: string,
    @Param('noteId') noteId: string,
    @Body() dto: UpdateNoteDto,
  ) {
    return this.notesService.update(user.companyId, id, noteId, user.userId, dto);
  }

  @Delete(':id/notes/:noteId')
  deleteNote(@CurrentUser() user: AuthenticatedRequestUser, @Param('id') id: string, @Param('noteId') noteId: string) {
    return this.notesService.delete(user.companyId, id, noteId, user.userId);
  }

  // ===========================================================================
  // Photos
  // ===========================================================================

  @Post(':id/photos/upload-url')
  presignPhoto(@CurrentUser() user: AuthenticatedRequestUser, @Param('id') id: string, @Body() dto: PresignPhotoUploadDto) {
    return this.filesService.presignPhotoUpload(user.companyId, id, dto);
  }

  @Post(':id/photos')
  @HttpCode(HttpStatus.CREATED)
  confirmPhoto(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Param('id') id: string,
    @Body() body: { key: string; photoType?: string; fileSizeBytes?: number; mimeType?: string },
  ) {
    return this.filesService.confirmPhotoUpload(user.companyId, id, user.userId, body);
  }

  @Get(':id/photos')
  listPhotos(@CurrentUser() user: AuthenticatedRequestUser, @Param('id') id: string) {
    return this.filesService.listPhotos(user.companyId, id);
  }

  @Delete(':id/photos/:photoId')
  deletePhoto(@CurrentUser() user: AuthenticatedRequestUser, @Param('id') id: string, @Param('photoId') photoId: string) {
    return this.filesService.deletePhoto(user.companyId, id, photoId);
  }

  // ===========================================================================
  // Documents
  // ===========================================================================

  @Post(':id/documents/upload-url')
  presignDocument(@CurrentUser() user: AuthenticatedRequestUser, @Param('id') id: string, @Body() dto: PresignDocumentUploadDto) {
    return this.filesService.presignDocumentUpload(user.companyId, id, dto);
  }

  @Post(':id/documents')
  @HttpCode(HttpStatus.CREATED)
  confirmDocument(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Param('id') id: string,
    @Body() body: { key: string; fileName: string; documentType?: string; fileSizeBytes?: number; mimeType?: string },
  ) {
    return this.filesService.confirmDocumentUpload(user.companyId, id, user.userId, body);
  }

  @Get(':id/documents')
  listDocuments(@CurrentUser() user: AuthenticatedRequestUser, @Param('id') id: string) {
    return this.filesService.listDocuments(user.companyId, id);
  }

  @Delete(':id/documents/:documentId')
  deleteDocument(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Param('id') id: string,
    @Param('documentId') documentId: string,
  ) {
    return this.filesService.deleteDocument(user.companyId, id, documentId);
  }

  // ===========================================================================
  // Custom fields (values, scoped to this customer)
  // ===========================================================================

  @Get(':id/custom-fields')
  getCustomFieldValues(@CurrentUser() user: AuthenticatedRequestUser, @Param('id') id: string) {
    return this.customFieldsService.getValuesForEntity(user.companyId, id);
  }

  @RequirePermissions('customers.write')
  @Patch(':id/custom-fields')
  setCustomFieldValues(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Param('id') id: string,
    @Body() dto: SetCustomFieldValuesDto,
  ) {
    return this.customFieldsService.setValues(user.companyId, 'customer', id, dto);
  }
}
