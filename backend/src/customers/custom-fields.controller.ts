import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { CustomFieldsService } from './services/custom-fields.service';
import { CreateCustomFieldDefinitionDto } from './dto/custom-field.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { AuthenticatedRequestUser } from '../auth/interfaces/jwt-payload.interface';

@Controller('custom-fields')
export class CustomFieldsController {
  constructor(private readonly customFieldsService: CustomFieldsService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedRequestUser, @Query('entityType') entityType = 'customer') {
    return this.customFieldsService.listDefinitions(user.companyId, entityType);
  }

  @RequirePermissions('settings.manage')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@CurrentUser() user: AuthenticatedRequestUser, @Body() dto: CreateCustomFieldDefinitionDto) {
    return this.customFieldsService.createDefinition(user.companyId, dto);
  }

  @RequirePermissions('settings.manage')
  @Delete(':id')
  delete(@CurrentUser() user: AuthenticatedRequestUser, @Param('id') id: string) {
    return this.customFieldsService.deleteDefinition(user.companyId, id);
  }
}
