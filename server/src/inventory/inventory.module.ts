import { Module, Global, OnModuleInit } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import Redis from 'ioredis';
import { redisConfig } from '../config/redis.config.js';
import { InventoryService } from './inventory.service.js';

export const REDIS_CLIENT = 'REDIS_CLIENT';

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      useFactory: (config: ConfigType<typeof redisConfig>) => {
        return new Redis({
          host: config.host,
          port: config.port,
          password: config.password,
          maxRetriesPerRequest: null, // Required by BullMQ
          retryStrategy: (times: number) => {
            if (times > 10) return null;
            return Math.min(times * 200, 5000);
          },
        });
      },
      inject: [redisConfig.KEY],
    },
    InventoryService,
  ],
  exports: [REDIS_CLIENT, InventoryService],
})
export class InventoryModule implements OnModuleInit {
  constructor(private readonly inventoryService: InventoryService) {}

  async onModuleInit() {
    // Initialize stock count in Redis if not already set
    await this.inventoryService.initializeStock();
  }
}
