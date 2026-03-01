import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import Redis from 'ioredis';
import { ConfigService } from '@nestjs/config';
import { AppModule } from '../src/app.module.js';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter.js';

describe('SaleController (e2e)', () => {
  let app: INestApplication<App>;
  let redis: Redis;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();

    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());

    await app.init();

    const configService = app.get(ConfigService);
    redis = new Redis({
      host: configService.get<string>('redis.host', 'localhost'),
      port: configService.get<number>('redis.port', 6379),
      password: configService.get<string>('redis.password') || undefined,
    });
  }, 30_000);

  afterAll(async () => {
    if (redis) await redis.quit();
    if (app) await app.close();
  });

  describe('GET /api/sale/status', () => {
    it('should return sale status with all required fields', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/sale/status')
        .expect(200);

      expect(res.body).toHaveProperty('status');
      expect(res.body).toHaveProperty('startsAt');
      expect(res.body).toHaveProperty('endsAt');
      expect(res.body).toHaveProperty('stockRemaining');
      expect(res.body).toHaveProperty('totalStock');

      expect(['upcoming', 'active', 'ended']).toContain(res.body.status);
      expect(typeof res.body.stockRemaining).toBe('number');
      expect(typeof res.body.totalStock).toBe('number');
      expect(res.body.stockRemaining).toBeGreaterThanOrEqual(0);
      expect(res.body.totalStock).toBeGreaterThan(0);
    });

    it('should return valid ISO date strings', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/sale/status')
        .expect(200);

      expect(new Date(res.body.startsAt).toISOString()).toBe(res.body.startsAt);
      expect(new Date(res.body.endsAt).toISOString()).toBe(res.body.endsAt);
    });

    it('should return stockRemaining <= totalStock', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/sale/status')
        .expect(200);

      expect(res.body.stockRemaining).toBeLessThanOrEqual(res.body.totalStock);
    });
  });
});
