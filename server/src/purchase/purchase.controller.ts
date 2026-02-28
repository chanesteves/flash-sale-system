import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { PurchaseService, PurchaseResult } from './purchase.service.js';
import { CreatePurchaseDto } from './dto/create-purchase.dto.js';
import { PurchaseStatusDto } from './dto/purchase-status.dto.js';
import { SaleActiveGuard } from '../common/guards/sale-active.guard.js';

@Controller('api/purchases')
export class PurchaseController {
  constructor(private readonly purchaseService: PurchaseService) {}

  @Post()
  @UseGuards(SaleActiveGuard)
  @HttpCode(HttpStatus.CREATED)
  async purchase(@Body() dto: CreatePurchaseDto): Promise<PurchaseResult> {
    return this.purchaseService.attemptPurchase(dto.userId);
  }

  @Get(':userId')
  async getStatus(
    @Param('userId') userId: string,
  ): Promise<PurchaseStatusDto> {
    return this.purchaseService.getPurchaseStatus(userId);
  }
}
