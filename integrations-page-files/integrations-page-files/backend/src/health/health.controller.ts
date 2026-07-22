import { Controller, Get, HttpException, HttpStatus } from '@nestjs/common';
import { Public } from '../auth/decorators/public.decorator';
import { SystemHealthService } from './system-health.service';

/**
 * A "the process is running" health check is close to useless for an app
 * this dependent on Postgres and Redis — a load balancer or orchestrator
 * needs to know whether THIS instance can actually serve traffic, and an
 * instance that's up but can't reach its database very much can't. Both
 * dependencies are checked with a real, cheap query/ping, not assumed.
 *
 * The actual check logic lives in SystemHealthService — this controller
 * and Settings > Integrations both call it, so there's one implementation.
 */
@Controller('health')
export class HealthController {
  constructor(private readonly systemHealth: SystemHealthService) {}

  @Public()
  @Get()
  async check() {
    const [dbOk, redisOk] = await Promise.all([this.systemHealth.checkDatabase(), this.systemHealth.checkRedis()]);
    const healthy = dbOk && redisOk;

    const body = {
      status: healthy ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      checks: { database: dbOk ? 'ok' : 'unreachable', redis: redisOk ? 'ok' : 'unreachable' },
    };

    if (!healthy) {
      // 503, not 200-with-a-status-field — an orchestrator's liveness/readiness
      // probe reads the HTTP status, not the body, in the common case.
      throw new HttpException(body, HttpStatus.SERVICE_UNAVAILABLE);
    }
    return body;
  }
}
