import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { ConfigModule } from './config/config.module.js';
import { SaleModule } from './sale/sale.module.js';
import { InventoryModule } from './inventory/inventory.module.js';
import { PurchaseModule } from './purchase/purchase.module.js';
import { Order } from './purchase/entities/order.entity.js';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';

@Module({
  imports: [
    // Configuration (loads .env, makes config globally available)
    ConfigModule,

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
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
