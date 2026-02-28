import { InventoryService } from './inventory.service';

/**
 * Mock Redis that simulates real Redis behavior for the Lua script.
 * This allows testing atomic purchase logic without a live Redis instance.
 */
class MockRedis {
  private store = new Map<string, string>();
  private sets = new Map<string, Set<string>>();

  async set(key: string, value: number | string, flag?: string): Promise<string | null> {
    if (flag === 'NX' && this.store.has(key)) {
      return null;
    }
    this.store.set(key, String(value));
    return 'OK';
  }

  async get(key: string): Promise<string | null> {
    return this.store.get(key) ?? null;
  }

  async incr(key: string): Promise<number> {
    const val = parseInt(this.store.get(key) || '0', 10) + 1;
    this.store.set(key, String(val));
    return val;
  }

  async sismember(key: string, member: string): Promise<number> {
    const set = this.sets.get(key);
    return set?.has(member) ? 1 : 0;
  }

  async srem(key: string, member: string): Promise<number> {
    const set = this.sets.get(key);
    if (set?.has(member)) {
      set.delete(member);
      return 1;
    }
    return 0;
  }

  async del(key: string): Promise<number> {
    const existed = this.store.has(key) || this.sets.has(key);
    this.store.delete(key);
    this.sets.delete(key);
    return existed ? 1 : 0;
  }

  /**
   * Simulates the atomic Lua script for purchase.
   * In real Redis, this runs atomically — no interleaving.
   * We simulate that by running it synchronously.
   */
  async eval(
    _script: string,
    _numKeys: number,
    stockKey: string,
    usersKey: string,
    userId: string,
  ): Promise<number> {
    // Get or create the users set
    if (!this.sets.has(usersKey)) {
      this.sets.set(usersKey, new Set());
    }
    const usersSet = this.sets.get(usersKey)!;

    // SADD — check if user already purchased
    if (usersSet.has(userId)) {
      return -1; // already purchased
    }
    usersSet.add(userId);

    // DECR stock
    const stock = parseInt(this.store.get(stockKey) || '0', 10) - 1;
    this.store.set(stockKey, String(stock));

    if (stock < 0) {
      // Rollback
      this.store.set(stockKey, String(stock + 1));
      usersSet.delete(userId);
      return 0; // sold out
    }

    return 1; // success
  }
}

describe('InventoryService', () => {
  let service: InventoryService;
  let mockRedis: MockRedis;

  const mockSaleConfig = {
    startTime: new Date('2026-03-01T10:00:00Z'),
    endTime: new Date('2026-03-01T11:00:00Z'),
    stockQuantity: 5,
  };

  beforeEach(async () => {
    mockRedis = new MockRedis();
    service = new InventoryService(
      mockRedis as any,
      mockSaleConfig as any,
    );
    await service.initializeStock();
  });

  describe('initializeStock', () => {
    it('should initialize stock count', async () => {
      const remaining = await service.getRemaining();
      expect(remaining).toBe(5);
    });

    it('should not overwrite existing stock (NX)', async () => {
      // Stock is already 5, calling init again should not reset it
      // Simulate some purchases first
      await service.tryReserve('user-1');
      await service.initializeStock();
      const remaining = await service.getRemaining();
      expect(remaining).toBe(4); // Should still be 4, not reset to 5
    });
  });

  describe('tryReserve', () => {
    it('should reserve stock for a new user', async () => {
      const result = await service.tryReserve('user-1');
      expect(result).toBe(1);
      const remaining = await service.getRemaining();
      expect(remaining).toBe(4);
    });

    it('should reject duplicate purchase from same user', async () => {
      await service.tryReserve('user-1');
      const result = await service.tryReserve('user-1');
      expect(result).toBe(-1);
      // Stock should not have decreased on duplicate
      const remaining = await service.getRemaining();
      expect(remaining).toBe(4);
    });

    it('should return sold out when stock is exhausted', async () => {
      for (let i = 0; i < 5; i++) {
        const result = await service.tryReserve(`user-${i}`);
        expect(result).toBe(1);
      }
      const result = await service.tryReserve('user-late');
      expect(result).toBe(0);
      const remaining = await service.getRemaining();
      expect(remaining).toBe(0);
    });

    it('should not oversell — exactly stockQuantity successful purchases', async () => {
      const results: number[] = [];
      for (let i = 0; i < 20; i++) {
        results.push(await service.tryReserve(`user-${i}`));
      }

      const successes = results.filter((r) => r === 1).length;
      const soldOuts = results.filter((r) => r === 0).length;
      const duplicates = results.filter((r) => r === -1).length;

      expect(successes).toBe(5);   // Exactly stockQuantity
      expect(soldOuts).toBe(15);   // Remaining are sold out
      expect(duplicates).toBe(0);  // All unique users
      expect(await service.getRemaining()).toBe(0);
    });

    it('should handle mixed duplicate and new users correctly', async () => {
      // 5 stock, but some users try twice
      expect(await service.tryReserve('alice')).toBe(1);    // success
      expect(await service.tryReserve('alice')).toBe(-1);   // duplicate
      expect(await service.tryReserve('bob')).toBe(1);      // success
      expect(await service.tryReserve('charlie')).toBe(1);  // success
      expect(await service.tryReserve('bob')).toBe(-1);     // duplicate
      expect(await service.tryReserve('dave')).toBe(1);     // success
      expect(await service.tryReserve('eve')).toBe(1);      // success (last stock)
      expect(await service.tryReserve('frank')).toBe(0);    // sold out

      expect(await service.getRemaining()).toBe(0);
    });
  });

  describe('releaseOne', () => {
    it('should restore stock and remove user from purchased set', async () => {
      await service.tryReserve('user-1');
      expect(await service.getRemaining()).toBe(4);
      expect(await service.hasUserPurchased('user-1')).toBe(true);

      await service.releaseOne('user-1');
      expect(await service.getRemaining()).toBe(5);
      expect(await service.hasUserPurchased('user-1')).toBe(false);
    });
  });

  describe('hasUserPurchased', () => {
    it('should return false for a user who has not purchased', async () => {
      expect(await service.hasUserPurchased('unknown')).toBe(false);
    });

    it('should return true for a user who has purchased', async () => {
      await service.tryReserve('user-1');
      expect(await service.hasUserPurchased('user-1')).toBe(true);
    });
  });

  describe('reset', () => {
    it('should reset stock and clear purchased users', async () => {
      await service.tryReserve('user-1');
      await service.tryReserve('user-2');
      expect(await service.getRemaining()).toBe(3);

      await service.reset(10);
      expect(await service.getRemaining()).toBe(10);
      expect(await service.hasUserPurchased('user-1')).toBe(false);
      expect(await service.hasUserPurchased('user-2')).toBe(false);
    });
  });

  describe('concurrent purchase simulation', () => {
    it('should handle 100 users competing for 5 items without overselling', async () => {
      // Simulate 100 concurrent users — all unique
      const promises = Array.from({ length: 100 }, (_, i) =>
        service.tryReserve(`concurrent-user-${i}`),
      );
      const results = await Promise.all(promises);

      const successes = results.filter((r) => r === 1).length;
      const soldOuts = results.filter((r) => r === 0).length;

      expect(successes).toBe(5);
      expect(soldOuts).toBe(95);
      expect(await service.getRemaining()).toBe(0);
    });

    it('should handle duplicate users in concurrent burst', async () => {
      // 50 unique users, each tries twice = 100 requests
      const promises: Promise<number>[] = [];
      for (let i = 0; i < 50; i++) {
        promises.push(service.tryReserve(`burst-user-${i}`));
        promises.push(service.tryReserve(`burst-user-${i}`));
      }
      const results = await Promise.all(promises);

      const successes = results.filter((r) => r === 1).length;
      const duplicates = results.filter((r) => r === -1).length;
      const soldOuts = results.filter((r) => r === 0).length;

      // Exactly 5 successes (stock limit)
      expect(successes).toBe(5);
      // No overselling
      expect(await service.getRemaining()).toBe(0);
      // Rest are either duplicates or sold out
      expect(duplicates + soldOuts).toBe(95);
    });
  });
});
