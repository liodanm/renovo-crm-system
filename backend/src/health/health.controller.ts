import { Controller, Get, HttpException, HttpStatus, Inject } from '@nestjs/common';
import Redis from 'ioredis';
import { PrismaService } from '../common/prisma/prisma.service';
import { Public } from '../auth/decorators/public.decorator';

/**
 * A "the process is running" health check is close to useless for an app
 * this dependent on Postgres and Redis — a load balancer or orchestrator
 * needs to know whether THIS instance can actually serve traffic, and an
 * instance that's up but can't reach its database very much can't. Both
 * dependencies are checked with a real, cheap query/ping, not assumed.
 */
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
  ) {}

  @Public()
  @Get()
  async check() {
    const [dbOk, redisOk] = await Promise.all([this.checkDatabase(), this.checkRedis()]);
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

  private async checkDatabase(): Promise<boolean> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }

  private async checkRedis(): Promise<boolean> {
    try {
      const pong = await this.redis.ping();
      return pong === 'PONG';
    } catch {
      return false;
    }
  }
}
