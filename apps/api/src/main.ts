// BigInt JSON serialization-ийг ХАМГИЙН ЭХЭНД идэвхжүүлнэ — §2.1
import './common/utils/bigint';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Logger as PinoLogger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { CorsIoAdapter } from './common/adapters/cors-io.adapter';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  // Бүтэцлэгдсэн лог (Pino) — §8
  app.useLogger(app.get(PinoLogger));

  const config = app.get(ConfigService);

  // Бүх API route /api префикстэй
  app.setGlobalPrefix('api');

  // CORS — frontend origin-ууд
  const origins = config
    .getOrThrow<string>('CORS_ORIGINS')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  app.enableCors({ origin: origins, credentials: true });

  // Socket.IO-д ижил CORS allowlist (§11)
  app.useWebSocketAdapter(new CorsIoAdapter(app, origins));

  // req.ip-ийг proxy-ийн ард зөв авах
  const httpAdapter = app.getHttpAdapter();
  const instance = httpAdapter.getInstance() as { set?: (k: string, v: unknown) => void };
  instance.set?.('trust proxy', 1);

  // Graceful shutdown (Prisma/Redis disconnect)
  app.enableShutdownHooks();

  const port = config.getOrThrow<number>('API_PORT');
  await app.listen(port);

  const logger = app.get(PinoLogger);
  logger.log(`API асав: http://localhost:${port}/api`);
}

void bootstrap();
