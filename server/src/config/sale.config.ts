import { registerAs } from '@nestjs/config';

export const saleConfig = registerAs('sale', () => ({
  startTime: new Date(
    process.env['SALE_START_TIME'] || '2026-03-01T10:00:00Z',
  ),
  endTime: new Date(process.env['SALE_END_TIME'] || '2026-03-01T11:00:00Z'),
  stockQuantity: parseInt(process.env['STOCK_QUANTITY'] || '100', 10),
}));

export type SaleConfig = ReturnType<typeof saleConfig>;
