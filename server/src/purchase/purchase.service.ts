import {
  Injectable,
  ConflictException,
  GoneException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { v4 as uuidv4 } from 'uuid';
import { InventoryService } from '../inventory/inventory.service.js';
import { Order } from './entities/order.entity.js';
import { PurchaseStatusDto } from './dto/purchase-status.dto.js';

export interface PurchaseResult {
  success: boolean;
  message: string;
  orderId?: string;
}

export interface OrderJobData {
  orderId: string;
  userId: string;
}

@Injectable()
export class PurchaseService {
  private readonly logger = new Logger(PurchaseService.name);

  constructor(
    private readonly inventoryService: InventoryService,
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
    @InjectQueue('order-processing')
    private readonly orderQueue: Queue<OrderJobData>,
  ) {}

  /**
   * Attempt to purchase an item for a user.
   * Uses Redis Lua script for atomic stock reservation + dedup.
   * On success, enqueues an async job to persist the order to PostgreSQL.
   */
  async attemptPurchase(userId: string): Promise<PurchaseResult> {
    // Atomic check: dedup + stock decrement in Redis
    const result = await this.inventoryService.tryReserve(userId);

    if (result === -1) {
      throw new ConflictException('You have already purchased this item.');
    }

    if (result === 0) {
      throw new GoneException('Sorry, the item is sold out.');
    }

    // Generate order ID and enqueue for async DB persistence
    const orderId = uuidv4();

    try {
      await this.orderQueue.add(
        'persist-order',
        { orderId, userId },
        {
          attempts: 3,
          backoff: { type: 'exponential', delay: 1000 },
          removeOnComplete: 100,
          removeOnFail: 50,
        },
      );

      this.logger.log(
        `Purchase confirmed for user ${userId}, orderId: ${orderId}`,
      );

      return {
        success: true,
        message: 'Purchase confirmed!',
        orderId,
      };
    } catch (error) {
      // If enqueue fails, rollback the Redis reservation
      this.logger.error(
        `Failed to enqueue order for user ${userId}, rolling back`,
        error,
      );
      await this.inventoryService.releaseOne(userId);
      throw error;
    }
  }

  /**
   * Check if a user has successfully purchased an item.
   */
  async getPurchaseStatus(userId: string): Promise<PurchaseStatusDto> {
    // First check Redis (fast path)
    const hasPurchased = await this.inventoryService.hasUserPurchased(userId);

    if (!hasPurchased) {
      return { purchased: false, userId };
    }

    // Check DB for the persisted order (may have a slight delay)
    const order = await this.orderRepository.findOne({ where: { userId } });

    return {
      purchased: true,
      userId,
      orderId: order?.id,
      purchasedAt: order?.createdAt?.toISOString(),
    };
  }
}
