import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import Redis from 'ioredis';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { ThrottlerGuard } from '@nestjs/throttler';
import { AppModule } from '../src/app.module.js';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter.js';
import { InventoryService } from '../src/inventory/inventory.service.js';
import { UserRateLimitGuard } from '../src/common/guards/user-rate-limit.guard.js';

/**
 * Integration tests for the purchase flow.
 *
 * REQUIREMENTS:
 *   - Docker services running (Redis + PostgreSQL)
 *   - SALE_START_TIME must be in the past and SALE_END_TIME in the future
 *     so the sale is ACTIVE during the test run.
 *
 * Run with:
 *   SALE_START_TIME=2020-01-01T00:00:00Z SALE_END_TIME=2099-01-01T00:00:00Z \
 *     npm run test:e2e -- --testPathPattern purchase
 */
describe('PurchaseController (e2e)', () => {
  let app: INestApplication<App>;
  let redis: Redis;
  let inventoryService: InventoryService;
  let dataSource: DataSource;

  beforeAll(async () => {
    // Override sale window env so the sale is always active
    process.env['SALE_START_TIME'] = '2020-01-01T00:00:00Z';
    process.env['SALE_END_TIME'] = '2099-01-01T00:00:00Z';
    process.env['STOCK_QUANTITY'] = '10';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(UserRateLimitGuard)
      .useValue({ canActivate: () => true })
      .compile();

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

    inventoryService = app.get(InventoryService);
    dataSource = app.get(DataSource);

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

  /**
   * Reset stock and purchased-users before each test,
   * and clear the orders table.
   */
  beforeEach(async () => {
    // Clear all flash_sale keys (rate-limit + purchase dedup + stock)
    const keys = await redis.keys('flash_sale:*');
    if (keys.length > 0) await redis.del(...keys);
    // Clear orders table
    await dataSource.query('DELETE FROM orders');
    // Reset stock AFTER clearing keys (reset sets flash_sale:stock_count)
    await inventoryService.reset(10);
  });

  /* ── Basic purchase flow ─────────────────────────────────── */

  describe('POST /api/purchases', () => {
    it('should successfully purchase an item', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/purchases')
        .send({ userId: 'e2e-user-1' })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.message).toBeDefined();
      expect(res.body.orderId).toBeDefined();
    });

    it('should reject duplicate purchase from the same user', async () => {
      await request(app.getHttpServer())
        .post('/api/purchases')
        .send({ userId: 'e2e-dup-user' })
        .expect(201);

      const res = await request(app.getHttpServer())
        .post('/api/purchases')
        .send({ userId: 'e2e-dup-user' })
        .expect(409);

      expect(res.body.message).toMatch(/already purchased/i);
    });

    it('should reject when stock is sold out', async () => {
      // Set stock to 1, then buy it
      await inventoryService.reset(1);

      await request(app.getHttpServer())
        .post('/api/purchases')
        .send({ userId: 'e2e-last-buyer' })
        .expect(201);

      const res = await request(app.getHttpServer())
        .post('/api/purchases')
        .send({ userId: 'e2e-too-late' })
        .expect(410);

      expect(res.body.message).toMatch(/sold out/i);
    });

    it('should reject request without userId', async () => {
      await request(app.getHttpServer())
        .post('/api/purchases')
        .send({})
        .expect(400);
    });

    it('should reject request with empty userId', async () => {
      await request(app.getHttpServer())
        .post('/api/purchases')
        .send({ userId: '' })
        .expect(400);
    });
  });

  /* ── Purchase status ─────────────────────────────────────── */

  describe('GET /api/purchases/:userId', () => {
    it('should return purchased: false for unknown user', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/purchases/e2e-unknown')
        .expect(200);

      expect(res.body.purchased).toBe(false);
      expect(res.body.userId).toBe('e2e-unknown');
    });

    it('should return purchased: true after successful purchase', async () => {
      await request(app.getHttpServer())
        .post('/api/purchases')
        .send({ userId: 'e2e-status-check' })
        .expect(201);

      const res = await request(app.getHttpServer())
        .get('/api/purchases/e2e-status-check')
        .expect(200);

      expect(res.body.purchased).toBe(true);
      expect(res.body.userId).toBe('e2e-status-check');
    });
  });

  /* ── Concurrency: N users, M stock → exactly M succeed ──── */

  describe('Concurrent purchases', () => {
    it('should allow exactly 5 purchases when stock is 5 with 10 concurrent users', async () => {
      const STOCK = 5;
      const NUM_USERS = 10;
      await inventoryService.reset(STOCK);

      const requests = Array.from({ length: NUM_USERS }, (_, i) =>
        request(app.getHttpServer())
          .post('/api/purchases')
          .send({ userId: `e2e-concurrent-${i}` }),
      );

      const results = await Promise.all(requests);

      const successes = results.filter((r) => r.status === 201);
      const soldOut = results.filter((r) => r.status === 410);

      expect(successes).toHaveLength(STOCK);
      expect(soldOut).toHaveLength(NUM_USERS - STOCK);
    });

    it('should allow exactly 1 purchase when 10 requests use the same userId', async () => {
      await inventoryService.reset(10);

      const requests = Array.from({ length: 10 }, () =>
        request(app.getHttpServer())
          .post('/api/purchases')
          .send({ userId: 'e2e-same-user' }),
      );

      const results = await Promise.all(requests);

      const successes = results.filter((r) => r.status === 201);
      const conflicts = results.filter((r) => r.status === 409);

      expect(successes).toHaveLength(1);
      expect(conflicts).toHaveLength(9);
    });
  });

  /* ── Stock count consistency ─────────────────────────────── */

  describe('Stock consistency', () => {
    it('should decrement stock correctly after purchases', async () => {
      const STOCK = 10;
      await inventoryService.reset(STOCK);

      const BUYERS = 3;
      for (let i = 0; i < BUYERS; i++) {
        await request(app.getHttpServer())
          .post('/api/purchases')
          .send({ userId: `e2e-stock-${i}` })
          .expect(201);
      }

      const statusRes = await request(app.getHttpServer())
        .get('/api/sale/status')
        .expect(200);

      expect(statusRes.body.stockRemaining).toBe(STOCK - BUYERS);
    });
  });
});
