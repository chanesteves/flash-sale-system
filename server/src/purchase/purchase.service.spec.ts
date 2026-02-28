import { ConflictException, GoneException, ServiceUnavailableException } from '@nestjs/common';
import { PurchaseService } from './purchase.service';

describe('PurchaseService', () => {
  let service: PurchaseService;
  let mockInventoryService: any;
  let mockOrderRepository: any;
  let mockOrderQueue: any;

  beforeEach(() => {
    mockInventoryService = {
      tryReserve: jest.fn(),
      releaseOne: jest.fn(),
      hasUserPurchased: jest.fn(),
    };

    mockOrderRepository = {
      findOne: jest.fn(),
    };

    mockOrderQueue = {
      add: jest.fn().mockResolvedValue({ id: 'job-1' }),
    };

    service = new PurchaseService(
      mockInventoryService,
      mockOrderRepository,
      mockOrderQueue,
    );
  });

  describe('attemptPurchase', () => {
    it('should confirm purchase when stock is available', async () => {
      mockInventoryService.tryReserve.mockResolvedValue(1);

      const result = await service.attemptPurchase('user-1');

      expect(result.success).toBe(true);
      expect(result.message).toBe('Purchase confirmed!');
      expect(result.orderId).toBeDefined();
      expect(mockOrderQueue.add).toHaveBeenCalledWith(
        'persist-order',
        expect.objectContaining({ userId: 'user-1' }),
        expect.any(Object),
      );
    });

    it('should throw ConflictException for duplicate purchase', async () => {
      mockInventoryService.tryReserve.mockResolvedValue(-1);

      await expect(service.attemptPurchase('user-1')).rejects.toThrow(
        ConflictException,
      );
      expect(mockOrderQueue.add).not.toHaveBeenCalled();
    });

    it('should throw GoneException when sold out', async () => {
      mockInventoryService.tryReserve.mockResolvedValue(0);

      await expect(service.attemptPurchase('user-1')).rejects.toThrow(
        GoneException,
      );
      expect(mockOrderQueue.add).not.toHaveBeenCalled();
    });

    it('should throw ServiceUnavailableException when Redis is down', async () => {
      mockInventoryService.tryReserve.mockRejectedValue(
        new Error('Redis connection refused'),
      );

      await expect(service.attemptPurchase('user-1')).rejects.toThrow(
        ServiceUnavailableException,
      );
    });

    it('should rollback reservation when queue enqueue fails', async () => {
      mockInventoryService.tryReserve.mockResolvedValue(1);
      mockOrderQueue.add.mockRejectedValue(new Error('Queue unavailable'));

      await expect(service.attemptPurchase('user-1')).rejects.toThrow(
        ServiceUnavailableException,
      );
      expect(mockInventoryService.releaseOne).toHaveBeenCalledWith('user-1');
    });
  });

  describe('getPurchaseStatus', () => {
    it('should return not purchased when user has not bought', async () => {
      mockInventoryService.hasUserPurchased.mockResolvedValue(false);

      const result = await service.getPurchaseStatus('user-1');

      expect(result.purchased).toBe(false);
      expect(result.userId).toBe('user-1');
      expect(result.orderId).toBeUndefined();
    });

    it('should return purchased with order details when order exists', async () => {
      mockInventoryService.hasUserPurchased.mockResolvedValue(true);
      mockOrderRepository.findOne.mockResolvedValue({
        id: 'order-abc',
        userId: 'user-1',
        createdAt: new Date('2026-03-01T10:05:00Z'),
      });

      const result = await service.getPurchaseStatus('user-1');

      expect(result.purchased).toBe(true);
      expect(result.orderId).toBe('order-abc');
      expect(result.purchasedAt).toBe('2026-03-01T10:05:00.000Z');
    });

    it('should return purchased without order when DB write is pending', async () => {
      mockInventoryService.hasUserPurchased.mockResolvedValue(true);
      mockOrderRepository.findOne.mockResolvedValue(null);

      const result = await service.getPurchaseStatus('user-1');

      expect(result.purchased).toBe(true);
      expect(result.orderId).toBeUndefined();
      expect(result.purchasedAt).toBeUndefined();
    });
  });
});
