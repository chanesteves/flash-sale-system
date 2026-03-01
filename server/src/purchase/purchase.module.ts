import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { PurchaseService } from './purchase.service.js';
import { PurchaseController } from './purchase.controller.js';
import { PurchaseProcessor } from './purchase.processor.js';
import { Order } from './entities/order.entity.js';
import { SaleModule } from '../sale/sale.module.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([Order]),
    BullModule.registerQueue({ name: 'order-processing' }),
    SaleModule,
  ],
  controllers: [PurchaseController],
  providers: [PurchaseService, PurchaseProcessor],
  exports: [PurchaseService],
})
export class PurchaseModule {}
