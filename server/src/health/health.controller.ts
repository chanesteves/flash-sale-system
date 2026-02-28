import { Controller, Get, Inject, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { DataSource } from 'typeorm';
import { REDIS_CLIENT } from '../inventory/inventory.module.js';

interface HealthStatus {
  status: 'ok' | 'degraded' | 'down';
  timestamp: string;
  services: {
    redis: ServiceStatus;
    database: ServiceStatus;
  };
}

interface ServiceStatus {
  status: 'up' | 'down';
  latencyMs?: number;
  error?: string;
}

@Controller('api/health')
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly dataSource: DataSource,
  ) {}

  @Get()
  async check(): Promise<HealthStatus> {
    const [redisStatus, dbStatus] = await Promise.all([
      this.checkRedis(),
      this.checkDatabase(),
    ]);

    const allUp = redisStatus.status === 'up' && dbStatus.status === 'up';
    const allDown = redisStatus.status === 'down' && dbStatus.status === 'down';

    return {
      status: allUp ? 'ok' : allDown ? 'down' : 'degraded',
      timestamp: new Date().toISOString(),
      services: {
        redis: redisStatus,
        database: dbStatus,
      },
    };
  }

  private async checkRedis(): Promise<ServiceStatus> {
    const start = Date.now();
    try {
      await this.redis.ping();
      return { status: 'up', latencyMs: Date.now() - start };
    } catch (error) {
      this.logger.warn(
        `Redis health check failed: ${error instanceof Error ? error.message : error}`,
      );
      return {
        status: 'down',
        latencyMs: Date.now() - start,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  private async checkDatabase(): Promise<ServiceStatus> {
    const start = Date.now();
    try {
      await this.dataSource.query('SELECT 1');
      return { status: 'up', latencyMs: Date.now() - start };
    } catch (error) {
      this.logger.warn(
        `Database health check failed: ${error instanceof Error ? error.message : error}`,
      );
      return {
        status: 'down',
        latencyMs: Date.now() - start,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}
