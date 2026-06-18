import { Module } from '@nestjs/common';
import { ShiftService } from './shift.service';
import { StaffController } from './staff.controller';
import { StaffService } from './staff.service';

/**
 * Ажилтан / Ээлж — CLAUDE.md §7.3.
 * Ээлж нээх/хаах нь transaction + audit; хаахад бэлэн мөнгөний тооцоо (§2.3, §8).
 */
@Module({
  controllers: [StaffController],
  providers: [StaffService, ShiftService],
  exports: [StaffService, ShiftService],
})
export class StaffModule {}
