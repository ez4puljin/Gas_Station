import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

/**
 * Admin panel — ажилтан/хэрэглэгч бүртгэл, role/permission тохиргоо (OWNER/ADMIN).
 * Салбарын CRUD нь StationsModule-д (PATCH/DELETE нэмэгдсэн).
 * AuthModule — нууц үг reset / идэвхгүй болгоход сесс (refresh token) цуцлахад TokenService.
 */
@Module({
  imports: [AuthModule],
  controllers: [AdminController],
  providers: [AdminService],
  exports: [AdminService],
})
export class AdminModule {}
