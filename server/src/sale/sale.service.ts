import { Injectable, Inject } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { saleConfig } from '../config/sale.config.js';
import { SaleStatus } from './dto/sale-status.dto.js';

@Injectable()
export class SaleService {
  constructor(
    @Inject(saleConfig.KEY)
    private readonly config: ConfigType<typeof saleConfig>,
  ) {}

  getStatus(): SaleStatus {
    const now = new Date();
    if (now < this.config.startTime) {
      return SaleStatus.UPCOMING;
    }
    if (now > this.config.endTime) {
      return SaleStatus.ENDED;
    }
    return SaleStatus.ACTIVE;
  }

  isActive(): boolean {
    return this.getStatus() === SaleStatus.ACTIVE;
  }

  getStartTime(): Date {
    return this.config.startTime;
  }

  getEndTime(): Date {
    return this.config.endTime;
  }

  getTotalStock(): number {
    return this.config.stockQuantity;
  }
}
