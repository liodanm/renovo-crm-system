import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { JobsService } from './services/jobs.service';
import { JobFieldOpsService } from './services/job-field-ops.service';
import { JobPhotosService } from './services/job-photos.service';
import { UpdateJobDto, PauseJobDto, CancelJobDto, QueryJobsDto } from './dto/job.dto';
import { StartJobDto, CompleteJobDetailsDto, CreateChemicalUsageDto, UpdateChemicalUsageDto, CreateEquipmentUsageDto, GpsCoordinatesDto } from './dto/field-ops.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { AuthenticatedRequestUser } from '../auth/interfaces/jwt-payload.interface';

@Controller('jobs')
@RequirePermissions('jobs.read')
export class JobsController {
  constructor(
    private readonly jobsService: JobsService,
    private readonly fieldOps: JobFieldOpsService,
    private readonly photos: JobPhotosService,
  ) {}

  // ---- Core (Phase 1) ----

  @Get()
  findAll(@CurrentUser() user: AuthenticatedRequestUser, @Query() query: QueryJobsDto) {
    return this.jobsService.findAll(user.companyId, query);
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthenticatedRequestUser, @Param('id') id: string) {
    return this.jobsService.findOne(user.companyId, id);
  }

  @Patch(':id')
  @RequirePermissions('jobs.write')
  update(@CurrentUser() user: AuthenticatedRequestUser, @Param('id') id: string, @Body() dto: UpdateJobDto) {
    return this.jobsService.update(user.companyId, id, dto);
  }

  @Post(':id/start')
  @RequirePermissions('jobs.write')
  start(@CurrentUser() user: AuthenticatedRequestUser, @Param('id') id: string, @Body() dto: StartJobDto) {
    return this.jobsService.start(user.companyId, id, user.userId, dto);
  }

  @Post(':id/pause')
  @RequirePermissions('jobs.write')
  pause(@CurrentUser() user: AuthenticatedRequestUser, @Param('id') id: string, @Body() dto: PauseJobDto) {
    return this.jobsService.pause(user.companyId, id, user.userId, dto);
  }

  @Post(':id/cancel')
  @RequirePermissions('jobs.write')
  cancel(@CurrentUser() user: AuthenticatedRequestUser, @Param('id') id: string, @Body() dto: CancelJobDto) {
    return this.jobsService.cancelJob(user.companyId, id, user.userId, dto);
  }

  @Post(':id/resume')
  @RequirePermissions('jobs.write')
  resume(@CurrentUser() user: AuthenticatedRequestUser, @Param('id') id: string) {
    return this.jobsService.resume(user.companyId, id, user.userId);
  }

  @Post(':id/complete')
  @RequirePermissions('jobs.write')
  complete(@CurrentUser() user: AuthenticatedRequestUser, @Param('id') id: string, @Body() dto: CompleteJobDetailsDto) {
    return this.jobsService.complete(user.companyId, id, user.userId, dto);
  }

  @Post(':id/checkin')
  @RequirePermissions('jobs.write')
  checkIn(@CurrentUser() user: AuthenticatedRequestUser, @Param('id') id: string, @Body() gps: GpsCoordinatesDto) {
    return this.fieldOps.checkIn(user.companyId, id, user.userId, gps);
  }

  // ---- Phase 2: Photos ----

  @Get(':id/photos')
  listPhotos(@CurrentUser() user: AuthenticatedRequestUser, @Param('id') id: string) {
    return this.photos.listByJob(user.companyId, id);
  }

  @Post(':id/photos')
  @RequirePermissions('jobs.write')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 15 * 1024 * 1024 } }))
  uploadPhoto(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('photoType') photoType: string,
    @Body('caption') caption: string | undefined,
    @Body('latitude') latitude: string | undefined,
    @Body('longitude') longitude: string | undefined,
  ) {
    const gps = { latitude: latitude ? Number(latitude) : undefined, longitude: longitude ? Number(longitude) : undefined };
    return this.photos.upload(user.companyId, id, user.userId, file, photoType, caption, gps);
  }

  @Get(':id/photos/:photoId/file')
  async getPhotoFile(@CurrentUser() user: AuthenticatedRequestUser, @Param('id') id: string, @Param('photoId') photoId: string, @Res() res: Response) {
    const { buffer, mimeType } = await this.photos.getFile(user.companyId, id, photoId);
    res.setHeader('Content-Type', mimeType ?? 'application/octet-stream');
    res.setHeader('Cache-Control', 'private, max-age=86400');
    res.send(buffer);
  }

  @Delete(':id/photos/:photoId')
  @RequirePermissions('jobs.write')
  deletePhoto(@CurrentUser() user: AuthenticatedRequestUser, @Param('id') id: string, @Param('photoId') photoId: string, @Body() gps: GpsCoordinatesDto) {
    return this.photos.delete(user.companyId, id, photoId, user.userId, gps);
  }

  // ---- Phase 2: Chemical usage ----

  @Get(':id/chemicals')
  listChemicals(@CurrentUser() user: AuthenticatedRequestUser, @Param('id') id: string) {
    return this.fieldOps.listChemicalUsage(user.companyId, id);
  }

  @Post(':id/chemicals')
  @RequirePermissions('jobs.write')
  addChemical(@CurrentUser() user: AuthenticatedRequestUser, @Param('id') id: string, @Body() dto: CreateChemicalUsageDto & GpsCoordinatesDto) {
    return this.fieldOps.addChemicalUsage(user.companyId, id, user.userId, dto, dto);
  }

  @Patch(':id/chemicals/:usageId')
  @RequirePermissions('jobs.write')
  updateChemical(@CurrentUser() user: AuthenticatedRequestUser, @Param('id') id: string, @Param('usageId') usageId: string, @Body() dto: UpdateChemicalUsageDto & GpsCoordinatesDto) {
    return this.fieldOps.updateChemicalUsage(user.companyId, id, usageId, user.userId, dto, dto);
  }

  @Delete(':id/chemicals/:usageId')
  @RequirePermissions('jobs.write')
  removeChemical(@CurrentUser() user: AuthenticatedRequestUser, @Param('id') id: string, @Param('usageId') usageId: string, @Body() gps: GpsCoordinatesDto) {
    return this.fieldOps.removeChemicalUsage(user.companyId, id, usageId, user.userId, gps);
  }

  // ---- Phase 2: Equipment usage ----

  @Get(':id/equipment')
  listEquipment(@CurrentUser() user: AuthenticatedRequestUser, @Param('id') id: string) {
    return this.fieldOps.listEquipmentUsage(user.companyId, id);
  }

  @Post(':id/equipment')
  @RequirePermissions('jobs.write')
  addEquipment(@CurrentUser() user: AuthenticatedRequestUser, @Param('id') id: string, @Body() dto: CreateEquipmentUsageDto & GpsCoordinatesDto) {
    return this.fieldOps.addEquipmentUsage(user.companyId, id, user.userId, dto, dto);
  }

  @Delete(':id/equipment/:usageId')
  @RequirePermissions('jobs.write')
  removeEquipment(@CurrentUser() user: AuthenticatedRequestUser, @Param('id') id: string, @Param('usageId') usageId: string, @Body() gps: GpsCoordinatesDto) {
    return this.fieldOps.removeEquipmentUsage(user.companyId, id, usageId, user.userId, gps);
  }

  // ---- Phase 2: Audit trail ----

  @Get(':id/audit-log')
  listAuditLog(@CurrentUser() user: AuthenticatedRequestUser, @Param('id') id: string) {
    return this.fieldOps.listAuditLog(user.companyId, id);
  }
}
