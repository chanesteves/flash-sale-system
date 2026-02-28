import { Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import { saleConfig } from './sale.config.js';
import { redisConfig } from './redis.config.js';
import { databaseConfig } from './database.config.js';

@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
      load: [saleConfig, redisConfig, databaseConfig],
      envFilePath: ['.env', '../.env'],
    }),
  ],
})
export class ConfigModule {}
