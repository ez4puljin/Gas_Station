import { Module } from '@nestjs/common';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';

/**
 * Нөөц / Агуулах — CLAUDE.md §7.2.
 * Резервуар, бараа, нийлүүлэлт, тооцоо нийлэх, шилжүүлэг, alert.
 * Бүх хөдөлгөөн StockMovement ledger-т; adjustment-д reason+actor заавал (§2.7).
 */
@Module({
  controllers: [InventoryController],
  providers: [InventoryService],
  exports: [InventoryService],
})
export class InventoryModule {}
