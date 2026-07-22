import { Inject, Injectable } from '@nestjs/common';
import Redis from 'ioredis';
import { PrismaService } from '../common/prisma/prisma.service';

/**
 * The one place "is the database/redis actually reachable" is checked.
 * HealthController (the orchestrator-facing /health endpoint) and the
 * Settings > Integrations System Health panel both call this — neither
 * has its own copy of the SELECT 1 / PING logic.
 */
@Injectable()
export class SystemHealthService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
  ) {}

  async checkDatabase(): Promise<boolean> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }

  async checkRedis(): Promise<boolean> {
    try {
      const pong = await this.redis.ping();
      return pong === 'PONG';
    } catch {
      return false;
    }
  }
}
