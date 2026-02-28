import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { ThrottlerModule } from '@nestjs/throttler';
import { ConfigService } from '@nestjs/config';
import { ConfigModule } from './config/config.module.js';
import { SaleModule } from './sale/sale.module.js';
import { InventoryModule } from './inventory/inventory.module.js';
import { PurchaseModule } from './purchase/purchase.module.js';
import { HealthModule } from './health/health.module.js';
import { Order } from './purchase/entities/order.entity.js';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';

@Module({
  imports: [
    // Configuration (loads .env, makes config globally available)
    ConfigModule,

    // Rate limiting (per-IP throttling)
    ThrottlerModule.forRoot([
      {
        name: 'short',
        ttl: 1000,   // 1 second window
        limit: 10,   // 10 requests per second per IP
      },
      {
        name: 'medium',
        ttl: 10000,  // 10 second window
        limit: 50,   // 50 requests per 10 seconds per IP
      },
    ]),

    // Database (PostgreSQL via TypeORM)
    TypeOrmModule.forRootAsync({
      useFactory: (configService: ConfigService) => ({
        type: 'postgres' as const,
        url: configService.get<string>('database.url'),
        entities: [Order],
        synchronize: true, // Auto-create tables in dev (disable in prod)
        logging: configService.get<string>('NODE_ENV') !== 'production',
      }),
      inject: [ConfigService],
    }),

    // Message Queue (BullMQ backed by Redis)
    BullModule.forRootAsync({
      useFactory: (configService: ConfigService) => ({
        connection: {
          host: configService.get<string>('redis.host'),
          port: configService.get<number>('redis.port'),
          password: configService.get<string>('redis.password') || undefined,
          maxRetriesPerRequest: null,
        },
      }),
      inject: [ConfigService],
    }),

    // Domain modules
    InventoryModule,
    SaleModule,
    PurchaseModule,
    HealthModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
