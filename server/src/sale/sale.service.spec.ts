import { SaleService } from './sale.service';
import { SaleStatus } from './dto/sale-status.dto';

describe('SaleService', () => {
  let service: SaleService;

  function createService(startTime: Date, endTime: Date, stockQuantity = 100) {
    return new SaleService({
      startTime,
      endTime,
      stockQuantity,
    } as any);
  }

  describe('getStatus', () => {
    it('should return UPCOMING when sale has not started', () => {
      const futureStart = new Date(Date.now() + 3600_000); // 1 hour from now
      const futureEnd = new Date(Date.now() + 7200_000);   // 2 hours from now
      service = createService(futureStart, futureEnd);

      expect(service.getStatus()).toBe(SaleStatus.UPCOMING);
    });

    it('should return ACTIVE when sale is in progress', () => {
      const pastStart = new Date(Date.now() - 1800_000);  // 30 min ago
      const futureEnd = new Date(Date.now() + 1800_000);  // 30 min from now
      service = createService(pastStart, futureEnd);

      expect(service.getStatus()).toBe(SaleStatus.ACTIVE);
    });

    it('should return ENDED when sale has finished', () => {
      const pastStart = new Date(Date.now() - 7200_000);  // 2 hours ago
      const pastEnd = new Date(Date.now() - 3600_000);    // 1 hour ago
      service = createService(pastStart, pastEnd);

      expect(service.getStatus()).toBe(SaleStatus.ENDED);
    });
  });

  describe('isActive', () => {
    it('should return true when sale is active', () => {
      const pastStart = new Date(Date.now() - 1800_000);
      const futureEnd = new Date(Date.now() + 1800_000);
      service = createService(pastStart, futureEnd);

      expect(service.isActive()).toBe(true);
    });

    it('should return false when sale is upcoming', () => {
      const futureStart = new Date(Date.now() + 3600_000);
      const futureEnd = new Date(Date.now() + 7200_000);
      service = createService(futureStart, futureEnd);

      expect(service.isActive()).toBe(false);
    });

    it('should return false when sale has ended', () => {
      const pastStart = new Date(Date.now() - 7200_000);
      const pastEnd = new Date(Date.now() - 3600_000);
      service = createService(pastStart, pastEnd);

      expect(service.isActive()).toBe(false);
    });
  });

  describe('getStartTime / getEndTime / getTotalStock', () => {
    it('should return configured values', () => {
      const start = new Date('2026-03-01T10:00:00Z');
      const end = new Date('2026-03-01T11:00:00Z');
      service = createService(start, end, 200);

      expect(service.getStartTime()).toEqual(start);
      expect(service.getEndTime()).toEqual(end);
      expect(service.getTotalStock()).toBe(200);
    });
  });
});
