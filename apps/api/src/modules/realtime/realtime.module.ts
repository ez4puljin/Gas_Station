import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { RealtimeGateway } from './realtime.gateway';

/**
 * Realtime (Socket.IO) — §4. Global тул бусад модуль RealtimeGateway-г inject хийж
 * эвент илгээнэ (sale.created, shift.changed, inventory.changed).
 */
@Global()
@Module({
  imports: [JwtModule.register({})],
  providers: [RealtimeGateway],
  exports: [RealtimeGateway],
})
export class RealtimeModule {}
