import type { INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import type { Server, ServerOptions } from 'socket.io';

/**
 * Socket.IO adapter — HTTP-тэй ижил CORS allowlist хэрэглүүлнэ (§11 нийцэл).
 * Gateway-ийн декораторт `origin: true` гэхийн оронд энд env-ийн жагсаалтыг өгнө.
 */
export class CorsIoAdapter extends IoAdapter {
  constructor(
    app: INestApplicationContext,
    private readonly origins: string[],
  ) {
    super(app);
  }

  override createIOServer(port: number, options?: ServerOptions): Server {
    return super.createIOServer(port, {
      ...options,
      cors: { origin: this.origins, credentials: true },
    }) as Server;
  }
}
