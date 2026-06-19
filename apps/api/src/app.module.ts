import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { validateEnv } from './config/env.schema';
import { buildLoggerOptions } from './common/logger/logger.config';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { StationAccessGuard } from './common/guards/station-access.guard';
import { AuditInterceptor } from './common/interceptors/audit.interceptor';
import { PrismaModule } from './common/prisma/prisma.module';
import { RedisModule } from './common/redis/redis.module';
import { AuditModule } from './modules/audit/audit.module';
import { RealtimeModule } from './modules/realtime/realtime.module';
import { AdminModule } from './modules/admin/admin.module';
import { AuthModule } from './modules/auth/auth.module';
import { CustomersModule } from './modules/customers/customers.module';
import { FinanceModule } from './modules/finance/finance.module';
import { HealthModule } from './modules/health/health.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { PosModule } from './modules/pos/pos.module';
import { ProcurementModule } from './modules/procurement/procurement.module';
import { StaffModule } from './modules/staff/staff.module';
import { StationsModule } from './modules/stations/stations.module';
import { SyncModule } from './modules/sync/sync.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        buildLoggerOptions({
          NODE_ENV: config.getOrThrow('NODE_ENV'),
          LOG_LEVEL: config.getOrThrow('LOG_LEVEL'),
          LOKI_URL: config.get('LOKI_URL'),
        }),
    }),
    // Дэд бүтэц
    PrismaModule,
    RedisModule,
    AuditModule,
    RealtimeModule,
    // Домэйн модулиуд
    AuthModule,
    HealthModule,
    StationsModule,
    PosModule,
    InventoryModule,
    StaffModule,
    FinanceModule,
    SyncModule,
    CustomersModule,
    ProcurementModule,
    AdminModule,
  ],
  providers: [
    // Бүх route-д JWT (Public-ээс бусад) — §11. ЭХЭНД ажиллаж req.user-ийг бүрдүүлнэ.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    // Салбарын хандалт хяналт — §10 (stationId агуулсан route-уудад defense-in-depth)
    { provide: APP_GUARD, useClass: StationAccessGuard },
    // RBAC role шалгалт — §11
    { provide: APP_GUARD, useClass: RolesGuard },
    // Эгзэгтэй үйлдлийн audit — §8
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
    // Нэгдсэн алдааны хэлбэр — §14
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
