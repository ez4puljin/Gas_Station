import { Module } from '@nestjs/common';
import { AccountingModule } from '../accounting/accounting.module';
import { CustomersModule } from '../customers/customers.module';
import { ProcurementModule } from '../procurement/procurement.module';
import { BankController } from './bank.controller';
import { BankService } from './bank.service';

/**
 * Банкны хуулга — импорт → тааруулах → GL-д бүртгэх.
 * Харилцагч/нийлүүлэгчийн төлбөрийг одоо байгаа үйлчилгээгээр бичдэг тул
 * тэдгээр модулиудыг импортолно (дэд дэвтэр + GL зэрэг зөв бичигдэнэ).
 */
@Module({
  imports: [AccountingModule, CustomersModule, ProcurementModule],
  controllers: [BankController],
  providers: [BankService],
  exports: [BankService],
})
export class BankModule {}
