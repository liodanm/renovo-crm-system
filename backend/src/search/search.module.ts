import { Module } from '@nestjs/common';
import { SearchController } from './search.controller';
import { SearchService } from './services/search.service';
import { PrismaService } from '../common/prisma/prisma.service';

@Module({
  controllers: [SearchController],
  providers: [PrismaService, SearchService],
})
export class SearchModule {}
