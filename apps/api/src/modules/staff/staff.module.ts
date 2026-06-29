import { Module } from '@nestjs/common';
import { AttendanceController } from './attendance.controller';
import { AttendanceService } from './attendance.service';
import { ShiftService } from './shift.service';
import { StaffController } from './staff.controller';
import { StaffService } from './staff.service';

/**
 * Ажилтан / Ээлж / Цаг бүртгэл — CLAUDE.md §7.3.
 * Ээлж нээх/хаах нь transaction + audit; хаахад бэлэн мөнгөний тооцоо (§2.3, §8).
 */
@Module({
  controllers: [StaffController, AttendanceController],
  providers: [StaffService, ShiftService, AttendanceService],
  exports: [StaffService, ShiftService, AttendanceService],
})
export class StaffModule {}
