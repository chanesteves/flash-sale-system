import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Job } from 'bullmq';
import { Order, OrderStatus } from './entities/order.entity.js';
import { OrderJobData } from './purchase.service.js';

@Processor('order-processing')
export class PurchaseProcessor extends WorkerHost {
  private readonly logger = new Logger(PurchaseProcessor.name);

  constructor(
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
  ) {
    super();
  }

  async process(job: Job<OrderJobData>): Promise<void> {
    const { orderId, userId } = job.data;

    this.logger.log(
      `Processing order ${orderId} for user ${userId} (attempt ${job.attemptsMade + 1})`,
    );

    try {
      const order = this.orderRepository.create({
        id: orderId,
        userId,
        status: OrderStatus.CONFIRMED,
      });

      await this.orderRepository.save(order);

      this.logger.log(`Order ${orderId} persisted for user ${userId}`);
    } catch (error: unknown) {
      // Handle unique constraint violation (duplicate userId) gracefully
      const isUniqueViolation =
        error instanceof Error &&
        'code' in error &&
        (error as Record<string, unknown>)['code'] === '23505';

      if (isUniqueViolation) {
        this.logger.warn(
          `Duplicate order for user ${userId} — already persisted, skipping`,
        );
        return; // Don't retry
      }

      this.logger.error(
        `Failed to persist order ${orderId}: ${error instanceof Error ? error.message : error}`,
      );
      throw error; // Will trigger BullMQ retry
    }
  }
}
