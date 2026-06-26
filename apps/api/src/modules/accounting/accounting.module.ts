import { Module } from '@nestjs/common';
import { AccountingController } from './accounting.controller';
import { AccountingService } from './accounting.service';

/**
 * Нягтлан бодох бүртгэл — Ерөнхий дэвтэр (GL): дансны төлөвлөгөө, давхар бичилтийн журнал,
 * Гүйлгээний баланс, Орлогын тайлан (P&L), Баланс. AccountingService.postJournalInTx-ийг
 * бусад модул (POS/худалдан авалт/касс/цалин) авто-бичилтэд ашиглана (exports).
 */
@Module({
  controllers: [AccountingController],
  providers: [AccountingService],
  exports: [AccountingService],
})
export class AccountingModule {}
