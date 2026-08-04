import { Module } from '@nestjs/common';
import { CustomersController } from './customers.controller';
import { CustomFieldsController } from './custom-fields.controller';
import { CustomersService } from './services/customers.service';
import { CustomerNotesService } from './services/customer-notes.service';
import { CustomerPropertiesService } from './services/customer-properties.service';
import { CustomerFilesService } from './services/customer-files.service';
import { CustomerImportExportService } from './services/customer-import-export.service';
import { CustomFieldsService } from './services/custom-fields.service';
import { DuplicateDetectionService } from './services/duplicate-detection.service';
import { GeocodingService } from '../geocoding/geocoding.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { StorageService } from '../common/storage/storage.service';

@Module({
  controllers: [CustomersController, CustomFieldsController],
  providers: [
    PrismaService,
    StorageService,
    CustomersService,
    CustomerNotesService,
    CustomerPropertiesService,
    CustomerFilesService,
    CustomerImportExportService,
    CustomFieldsService,
    DuplicateDetectionService,
    GeocodingService,
  ],
  exports: [CustomersService, CustomerPropertiesService],
})
export class CustomersModule {}
