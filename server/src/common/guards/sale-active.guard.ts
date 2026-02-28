import {
  Injectable,
  CanActivate,
  ExecutionContext,
  BadRequestException,
} from '@nestjs/common';
import { SaleService } from '../../sale/sale.service.js';
import { SaleStatus } from '../../sale/dto/sale-status.dto.js';

@Injectable()
export class SaleActiveGuard implements CanActivate {
  constructor(private readonly saleService: SaleService) {}

  canActivate(_context: ExecutionContext): boolean {
    const status = this.saleService.getStatus();

    if (status === SaleStatus.UPCOMING) {
      throw new BadRequestException(
        'The sale has not started yet. Please wait.',
      );
    }

    if (status === SaleStatus.ENDED) {
      throw new BadRequestException('The sale has ended.');
    }

    return true;
  }
}
