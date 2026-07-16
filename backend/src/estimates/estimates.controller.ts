import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { EstimatesService } from './services/estimates.service';
import { CreateEstimateDto } from './dto/create-estimate.dto';
import { UpdateEstimateDto } from './dto/update-estimate.dto';
import { QueryEstimatesDto } from './dto/query-estimates.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { AuthenticatedRequestUser } from '../auth/interfaces/jwt-payload.interface';

@Controller('estimates')
@RequirePermissions('estimates.read') // baseline for the whole controller; write ops layer 'estimates.write' on top, same pattern as CustomersController
export class EstimatesController {
  constructor(private readonly estimatesService: EstimatesService) {}

  @Get()
  findAll(@CurrentUser() user: AuthenticatedRequestUser, @Query() query: QueryEstimatesDto) {
    return this.estimatesService.findAll(user.companyId, query);
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthenticatedRequestUser, @Param('id') id: string) {
    return this.estimatesService.findOne(user.companyId, id, this.canViewProfitability(user));
  }

  @Post()
  @RequirePermissions('estimates.write')
  create(@CurrentUser() user: AuthenticatedRequestUser, @Body() dto: CreateEstimateDto) {
    return this.estimatesService.create(user.companyId, dto, this.canViewProfitability(user));
  }

  @Patch(':id')
  @RequirePermissions('estimates.write')
  update(@CurrentUser() user: AuthenticatedRequestUser, @Param('id') id: string, @Body() dto: UpdateEstimateDto) {
    return this.estimatesService.update(user.companyId, id, dto, this.canViewProfitability(user));
  }

  @Post(':id/send')
  @RequirePermissions('estimates.write')
  send(@CurrentUser() user: AuthenticatedRequestUser, @Param('id') id: string) {
    return this.estimatesService.send(user.companyId, id);
  }

  @Post(':id/convert-to-job')
  @RequirePermissions('estimates.write')
  convertToJob(@CurrentUser() user: AuthenticatedRequestUser, @Param('id') id: string) {
    return this.estimatesService.convertToJob(user.companyId, id);
  }

  @Delete(':id')
  @RequirePermissions('estimates.write')
  remove(@CurrentUser() user: AuthenticatedRequestUser, @Param('id') id: string) {
    return this.estimatesService.remove(user.companyId, id);
  }

  // A real permission check, not a role-name check — 'estimates.profitability'
  // is granted to owner/admin today (migration 010), but the actual
  // access boundary is the permission itself, same as every other
  // @RequirePermissions() gate in this app. If a company ever customizes
  // its roles, this stays correct without any code change here.
  private canViewProfitability(user: AuthenticatedRequestUser): boolean {
    return user.permissions.includes('estimates.profitability');
  }
}
