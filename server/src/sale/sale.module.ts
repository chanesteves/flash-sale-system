import { Module, forwardRef } from '@nestjs/common';
import { SaleService } from './sale.service.js';
import { SaleController } from './sale.controller.js';
import { InventoryModule } from '../inventory/inventory.module.js';

@Module({
  imports: [forwardRef(() => InventoryModule)],
  controllers: [SaleController],
  providers: [SaleService],
  exports: [SaleService],
})
export class SaleModule {}
