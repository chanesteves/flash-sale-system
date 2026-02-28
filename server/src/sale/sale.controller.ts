import { Controller, Get } from '@nestjs/common';
import { SaleService } from './sale.service.js';
import { SaleStatusDto } from './dto/sale-status.dto.js';
import { InventoryService } from '../inventory/inventory.service.js';

@Controller('api/sale')
export class SaleController {
  constructor(
    private readonly saleService: SaleService,
    private readonly inventoryService: InventoryService,
  ) {}

  @Get('status')
  async getStatus(): Promise<SaleStatusDto> {
    const status = this.saleService.getStatus();
    const stockRemaining = await this.inventoryService.getRemaining();

    return {
      status,
      startsAt: this.saleService.getStartTime().toISOString(),
      endsAt: this.saleService.getEndTime().toISOString(),
      stockRemaining,
      totalStock: this.saleService.getTotalStock(),
    };
  }
}
