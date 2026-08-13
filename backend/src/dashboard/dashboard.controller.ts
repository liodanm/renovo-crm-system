import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedRequestUser } from '../auth/interfaces/jwt-payload.interface';
import { CalendarRangeQueryDto } from './dto/calendar-range.dto';
import { IntegrationsService } from '../settings/services/integrations.service';

@Controller('dashboard')
export class DashboardController {
  constructor(
    private readonly dashboardService: DashboardService,
    private readonly integrations: IntegrationsService,
  ) {}

  /**
   * The primary payload for the dashboard's summary cards (Today's Jobs,
   * Today's Revenue, Pending Estimates, Open Leads, Recent Payments).
   * No @RequirePermissions() here deliberately — every authenticated
   * company member can load the dashboard; DashboardService shapes the
   * response per-section based on the caller's actual permissions, so a
   * crew_member gets a real (not error) response with only what they can see.
   */
  /**
   * A dashboard page load previously meant 5 separate round trips (summary,
   * calendar, map, notifications, ai-suggestions) before the page was fully
   * rendered — each with its own network latency, and on a mobile
   * connection that's the difference between a dashboard that feels instant
   * and one that visibly "fills in" over a couple seconds. This bundles all
   * five into one request, run concurrently server-side (not sequentially —
   * see Promise.all below), so the client pays for one round trip's latency
   * instead of five's.
   *
   * `weather` is deliberately NOT included: it needs client-supplied
   * lat/lng (from browser geolocation, which may still be awaiting a
   * permission prompt when this fires) that isn't available at request
   * time the way the other five sections' data is — bundling it would mean
   * either blocking this whole response on a permission dialog the user
   * hasn't answered yet, or silently omitting weather with no clear signal
   * why. It stays a separate, independently-fetched call once coordinates
   * are known. `calendar` uses the same default range (this week) the
   * individual endpoint defaults to; a client that needs a different range
   * still calls `/dashboard/calendar` directly.
   */
  @Get('bootstrap')
  async getBootstrap(@CurrentUser() user: AuthenticatedRequestUser) {
    const start = startOfWeek(new Date());
    const end = addDays(start, 7);

    const [summary, calendar, map, notifications, aiSuggestions] = await Promise.all([
      this.dashboardService.getSummary(user),
      this.dashboardService.getCalendar(user.companyId, start, end),
      this.dashboardService.getMapData(user.companyId),
      this.dashboardService.getNotifications(user.companyId, user.userId),
      this.dashboardService.getAiSuggestions(user.companyId),
    ]);

    return { summary, calendar, map, notifications, aiSuggestions };
  }

  @Get('summary')
  getSummary(@CurrentUser() user: AuthenticatedRequestUser) {
    return this.dashboardService.getSummary(user);
  }

  @Get('calendar')
  getCalendar(@CurrentUser() user: AuthenticatedRequestUser, @Query() query: CalendarRangeQueryDto) {
    const start = query.start ? new Date(query.start) : startOfWeek(new Date());
    const end = query.end ? new Date(query.end) : addDays(start, 7);
    return this.dashboardService.getCalendar(user.companyId, start, end);
  }

  @Get('map')
  getMap(@CurrentUser() user: AuthenticatedRequestUser) {
    return this.dashboardService.getMapData(user.companyId);
  }

  @Get('weather')
  getWeather(@Query('lat') lat: string, @Query('lng') lng: string) {
    const latitude = parseFloat(lat);
    const longitude = parseFloat(lng);
    if (Number.isNaN(latitude) || Number.isNaN(longitude)) {
      throw new BadRequestException('lat and lng query params are required and must be numeric');
    }
    return this.dashboardService.getWeather(latitude, longitude);
  }

  @Get('notifications')
  getNotifications(@CurrentUser() user: AuthenticatedRequestUser) {
    return this.dashboardService.getNotifications(user.companyId, user.userId);
  }

  @Get('ai-suggestions')
  getAiSuggestions(@CurrentUser() user: AuthenticatedRequestUser) {
    return this.dashboardService.getAiSuggestions(user.companyId);
  }

  @Get('google-reviews')
  getGoogleReviews(@CurrentUser() user: AuthenticatedRequestUser) {
    return this.integrations.getGoogleReviews(user.companyId);
  }
}

function startOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}
