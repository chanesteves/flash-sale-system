import { Injectable, Inject, Logger } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import Redis from 'ioredis';
import { REDIS_CLIENT } from './constants.js';
import { saleConfig } from '../config/sale.config.js';

const STOCK_KEY = 'flash_sale:stock_count';
const PURCHASED_USERS_KEY = 'flash_sale:purchased_users';

/**
 * Lua script for atomic purchase:
 * - Checks if user has already purchased (SADD to purchased_users set)
 * - If duplicate, returns -1
 * - Decrements stock count
 * - If stock < 0, rolls back both operations, returns 0
 * - Otherwise returns 1 (success)
 */
const PURCHASE_LUA_SCRIPT = `
local stockKey = KEYS[1]
local usersKey = KEYS[2]
local userId = ARGV[1]

-- Check if user already purchased (SADD returns 0 if already in set)
local added = redis.call('SADD', usersKey, userId)
if added == 0 then
    return -1  -- already purchased
end

-- Decrement stock
local stock = redis.call('DECR', stockKey)
if stock < 0 then
    -- Rollback: restore stock and remove user from set
    redis.call('INCR', stockKey)
    redis.call('SREM', usersKey, userId)
    return 0   -- sold out
end

return 1       -- success
`;

@Injectable()
export class InventoryService {
  private readonly logger = new Logger(InventoryService.name);

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @Inject(saleConfig.KEY)
    private readonly config: ConfigType<typeof saleConfig>,
  ) {}

  /**
   * Initialize stock count in Redis. Only sets if key doesn't exist (NX).
   */
  async initializeStock(): Promise<void> {
    const result = await this.redis.set(
      STOCK_KEY,
      this.config.stockQuantity,
      'NX',
    );
    if (result === 'OK') {
      this.logger.log(
        `Initialized stock count to ${this.config.stockQuantity}`,
      );
    } else {
      const current = await this.redis.get(STOCK_KEY);
      this.logger.log(`Stock already initialized at ${current}`);
    }
  }

  /**
   * Atomically attempt to reserve one item for a user.
   * Returns:
   *  1  = success (stock reserved, user recorded)
   *  0  = sold out
   * -1  = user already purchased
   */
  async tryReserve(userId: string): Promise<number> {
    const result = await this.redis.eval(
      PURCHASE_LUA_SCRIPT,
      2,
      STOCK_KEY,
      PURCHASED_USERS_KEY,
      userId,
    );
    return result as number;
  }

  /**
   * Release one unit of stock (rollback scenario).
   */
  async releaseOne(userId: string): Promise<void> {
    await this.redis.incr(STOCK_KEY);
    await this.redis.srem(PURCHASED_USERS_KEY, userId);
    this.logger.warn(`Released stock for user ${userId}`);
  }

  /**
   * Get the remaining stock count.
   */
  async getRemaining(): Promise<number> {
    const stock = await this.redis.get(STOCK_KEY);
    return stock ? parseInt(stock, 10) : 0;
  }

  /**
   * Check if a user has already purchased.
   */
  async hasUserPurchased(userId: string): Promise<boolean> {
    const result = await this.redis.sismember(PURCHASED_USERS_KEY, userId);
    return result === 1;
  }

  /**
   * Reset stock and purchased users (for testing).
   */
  async reset(stockQuantity?: number): Promise<void> {
    const qty = stockQuantity ?? this.config.stockQuantity;
    await this.redis.set(STOCK_KEY, qty);
    await this.redis.del(PURCHASED_USERS_KEY);
    this.logger.log(`Reset stock to ${qty} and cleared purchased users`);
  }
}
