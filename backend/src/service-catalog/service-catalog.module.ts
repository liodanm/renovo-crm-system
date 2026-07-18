import { Module } from '@nestjs/common';
import { ServiceCatalogController } from './service-catalog.controller';
import { ServiceCatalogService } from './services/service-catalog.service';
import { PrismaService } from '../common/prisma/prisma.service';

@Module({
  controllers: [ServiceCatalogController],
  providers: [PrismaService, ServiceCatalogService],
  exports: [ServiceCatalogService],
})
export class ServiceCatalogModule {}
