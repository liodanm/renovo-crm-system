import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { SchedulingService } from './services/scheduling.service';
import { ScheduleJobDto, RescheduleAppointmentDto, UpdateAppointmentAssignmentDto, QueryCalendarDto, CancelAppointmentDto, CreateCalendarItemDto, UpdateCalendarItemDto } from './dto/scheduling.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { AuthenticatedRequestUser } from '../auth/interfaces/jwt-payload.interface';

@Controller('scheduling')
@RequirePermissions('jobs.read')
export class SchedulingController {
  constructor(private readonly scheduling: SchedulingService) {}

  @Get('calendar')
  getCalendar(@CurrentUser() user: AuthenticatedRequestUser, @Query() query: QueryCalendarDto) {
    return this.scheduling.getCalendar(user.companyId, query);
  }

  @Get('appointments/:id')
  getAppointment(@CurrentUser() user: AuthenticatedRequestUser, @Param('id') id: string) {
    return this.scheduling.getAppointment(user.companyId, id);
  }

  @Post('jobs/:jobId')
  @RequirePermissions('jobs.write')
  scheduleJob(@CurrentUser() user: AuthenticatedRequestUser, @Param('jobId') jobId: string, @Body() dto: ScheduleJobDto) {
    return this.scheduling.scheduleJob(user.companyId, jobId, user.userId, dto);
  }

  // General-purpose Calendar Items — reuse the same appointments table
  // and the same jobs.write permission as every other write below;
  // deliberately not a new permission, since this is the same
  // underlying calendar, not a separate feature to gate differently.
  @Post('calendar-items')
  @RequirePermissions('jobs.write')
  createCalendarItem(@CurrentUser() user: AuthenticatedRequestUser, @Body() dto: CreateCalendarItemDto) {
    return this.scheduling.createCalendarItem(user.companyId, user.userId, dto);
  }

  @Patch('calendar-items/:id')
  @RequirePermissions('jobs.write')
  updateCalendarItem(@CurrentUser() user: AuthenticatedRequestUser, @Param('id') id: string, @Body() dto: UpdateCalendarItemDto) {
    return this.scheduling.updateCalendarItem(user.companyId, id, dto);
  }

  @Patch('appointments/:id/reschedule')
  @RequirePermissions('jobs.write')
  reschedule(@CurrentUser() user: AuthenticatedRequestUser, @Param('id') id: string, @Body() dto: RescheduleAppointmentDto) {
    return this.scheduling.reschedule(user.companyId, id, dto);
  }

  @Patch('appointments/:id/assignment')
  @RequirePermissions('jobs.write')
  updateAssignment(@CurrentUser() user: AuthenticatedRequestUser, @Param('id') id: string, @Body() dto: UpdateAppointmentAssignmentDto) {
    return this.scheduling.updateAssignment(user.companyId, id, dto);
  }

  @Post('appointments/:id/cancel')
  @RequirePermissions('jobs.write')
  cancel(@CurrentUser() user: AuthenticatedRequestUser, @Param('id') id: string, @Body() dto: CancelAppointmentDto) {
    return this.scheduling.cancel(user.companyId, id, user.userId, dto.reason);
  }

  @Delete('appointments/:id')
  @RequirePermissions('jobs.write')
  unschedule(@CurrentUser() user: AuthenticatedRequestUser, @Param('id') id: string) {
    return this.scheduling.unschedule(user.companyId, id);
  }
}
