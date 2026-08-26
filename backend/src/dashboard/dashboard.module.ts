import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { WeatherService } from '../weather/weather.service';
import { AiSuggestionsService } from '../ai/ai-suggestions.service';
import { SettingsModule } from '../settings/settings.module';
import { ReportsModule } from '../reports/reports.module';

@Module({
  imports: [SettingsModule, ReportsModule],
  controllers: [DashboardController],
  providers: [DashboardService, PrismaService, WeatherService, AiSuggestionsService],
})
export class DashboardModule {}
