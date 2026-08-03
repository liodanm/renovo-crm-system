import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ServiceCatalogService } from './services/service-catalog.service';
import { CreateServiceCatalogItemDto, UpdateServiceCatalogItemDto, ReorderServiceCatalogDto } from './dto/service-catalog.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { AuthenticatedRequestUser } from '../auth/interfaces/jwt-payload.interface';

@Controller('service-catalog')
@RequirePermissions('estimates.read')
export class ServiceCatalogController {
  constructor(private readonly catalog: ServiceCatalogService) {}

  @Get()
  findAll(@CurrentUser() user: AuthenticatedRequestUser, @Query('activeOnly') activeOnly?: string) {
    return this.catalog.findAll(user.companyId, activeOnly === 'true');
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthenticatedRequestUser, @Param('id') id: string) {
    return this.catalog.findOne(user.companyId, id);
  }

  @Post()
  @RequirePermissions('estimates.write')
  create(@CurrentUser() user: AuthenticatedRequestUser, @Body() dto: CreateServiceCatalogItemDto) {
    return this.catalog.create(user.companyId, dto);
  }

  @Patch('reorder')
  @RequirePermissions('estimates.write')
  reorder(@CurrentUser() user: AuthenticatedRequestUser, @Body() dto: ReorderServiceCatalogDto) {
    return this.catalog.reorder(user.companyId, dto.ids);
  }

  @Patch(':id')
  @RequirePermissions('estimates.write')
  update(@CurrentUser() user: AuthenticatedRequestUser, @Param('id') id: string, @Body() dto: UpdateServiceCatalogItemDto) {
    return this.catalog.update(user.companyId, id, dto);
  }

  @Delete(':id')
  @RequirePermissions('estimates.write')
  archive(@CurrentUser() user: AuthenticatedRequestUser, @Param('id') id: string) {
    return this.catalog.archive(user.companyId, id);
  }
}
