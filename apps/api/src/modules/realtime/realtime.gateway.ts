import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  type OnGatewayConnection,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import type { AuthUser } from '@fuel/types';

/** Realtime эвентүүд — §4 (самбар, POS sync, alert) */
export const RealtimeEvent = {
  SALE_CREATED: 'sale.created',
  SHIFT_CHANGED: 'shift.changed',
  INVENTORY_CHANGED: 'inventory.changed',
  STOCK_ALERT: 'stock.alert',
} as const;
export type RealtimeEvent = (typeof RealtimeEvent)[keyof typeof RealtimeEvent];

/**
 * Socket.IO gateway — CLAUDE.md §4, §10.
 * JWT-аар handshake баталгаажуулж, салбарын room-д нэгтгэнэ:
 *   • owner/admin (allStations) → `company:{companyId}` room (бүх салбарын эвент)
 *   • бусад → зөвхөн эрхтэй `station:{id}` room-ууд
 * emitToStation нь station + company room хоёуланд илгээж scope-ийг хадгална.
 */
// CORS-ийг CorsIoAdapter (main.ts) дээр env allowlist-аар тохируулна (§11).
@WebSocketGateway({ namespace: '/realtime' })
export class RealtimeGateway implements OnGatewayConnection {
  @WebSocketServer() server!: Server;
  private readonly logger = new Logger('Realtime');

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async handleConnection(client: Socket): Promise<void> {
    try {
      const token = this.extractToken(client);
      if (!token) {
        client.disconnect(true);
        return;
      }
      const payload = await this.jwt.verifyAsync<AuthUser & { exp?: number }>(token, {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      });
      client.data.user = payload;

      if (payload.allStations) {
        await client.join(`company:${payload.companyId}`);
      } else {
        for (const stationId of payload.stationIds) {
          await client.join(`station:${stationId}`);
        }
      }

      // Access token дуусахад socket-ийг таслах — §11 (богино насжилттай token-ийг WS дээр мөрдүүлнэ)
      if (payload.exp) {
        const ms = payload.exp * 1000 - Date.now();
        if (ms > 0) {
          const timer = setTimeout(() => client.disconnect(true), Math.min(ms, 2_147_483_000));
          client.on('disconnect', () => clearTimeout(timer));
        } else {
          client.disconnect(true);
        }
      }
    } catch {
      client.disconnect(true);
    }
  }

  private extractToken(client: Socket): string | null {
    const fromAuth = client.handshake.auth?.token;
    if (typeof fromAuth === 'string' && fromAuth) return fromAuth;
    const header = client.handshake.headers.authorization;
    if (typeof header === 'string' && header.startsWith('Bearer ')) {
      return header.slice(7);
    }
    return null;
  }

  /**
   * Салбарын эвент — тухайн station room + компанийн room хоёуланд (§10 scope).
   * Emit нь commit хийгдсэн бичилтийн дараа явдаг тул ХЭЗЭЭ Ч throw болж HTTP хариуг
   * унагаахгүй (try/catch swallow + лог).
   */
  emitToStation(
    companyId: string,
    stationId: string,
    event: RealtimeEvent,
    payload: Record<string, unknown>,
  ): void {
    if (!this.server) return;
    try {
      this.server.to(`station:${stationId}`).to(`company:${companyId}`).emit(event, payload);
    } catch (err) {
      this.logger.warn(`Realtime emit алдаа (${event}): ${(err as Error).message}`);
    }
  }
}
