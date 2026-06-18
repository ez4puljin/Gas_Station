import { randomUUID } from 'node:crypto';
import type { Params } from 'nestjs-pino';
import type { Env } from '../../config/env.schema';

type LoggerEnv = Pick<Env, 'NODE_ENV' | 'LOG_LEVEL' | 'LOKI_URL'>;

/**
 * Pino logger тохиргоо — CLAUDE.md §8.
 *   • Бүтэцлэгдсэн JSON, бүх хүсэлтэд correlationId.
 *   • Эмзэг талбарыг redact: password, token, pan, cvv, pin, authorization (§2.5).
 *   • Production-д Loki руу, dev-д уншихад хялбар pretty.
 */
const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.body.password',
  'req.body.currentPassword',
  'req.body.newPassword',
  'req.body.token',
  'req.body.refreshToken',
  'req.body.pin',
  'req.body.pan',
  'req.body.cvv',
  '*.password',
  '*.passwordHash',
  '*.password_hash',
  '*.token',
  '*.refreshToken',
  '*.refresh_token',
  '*.accessToken',
  '*.access_token',
  '*.pan',
  '*.maskedPan',
  '*.cardNumber',
  '*.card_number',
  '*.reference',
  '*.cvv',
  '*.pin',
  '*.otp',
  '*.secret',
  '*.apiKey',
  '*.authorization',
];

export function buildLoggerOptions(env: LoggerEnv): Params {
  const isProd = env.NODE_ENV === 'production';

  const targets: Array<{ target: string; level?: string; options?: Record<string, unknown> }> =
    [];
  if (!isProd) {
    targets.push({
      target: 'pino-pretty',
      level: env.LOG_LEVEL,
      options: { singleLine: true, colorize: true, translateTime: 'SYS:standard' },
    });
  } else if (env.LOKI_URL) {
    targets.push({
      target: 'pino-loki',
      level: env.LOG_LEVEL,
      options: {
        host: env.LOKI_URL,
        labels: { app: 'fuel-api', env: env.NODE_ENV },
        batching: true,
        interval: 5,
      },
    });
  }

  return {
    pinoHttp: {
      level: env.LOG_LEVEL,
      // correlationId — header байвал ашиглана, эс бөгөөс шинээр үүсгэнэ
      genReqId: (req, res) => {
        const fromHeader = req.headers['x-correlation-id'];
        const id = (Array.isArray(fromHeader) ? fromHeader[0] : fromHeader) ?? randomUUID();
        res.setHeader('x-correlation-id', id);
        return id;
      },
      customProps: (req) => ({ correlationId: req.id }),
      redact: { paths: REDACT_PATHS, censor: '[REDACTED]' },
      transport: targets.length > 0 ? { targets } : undefined,
      serializers: {
        req: (req: { id: string; method: string; url: string }) => ({
          id: req.id,
          method: req.method,
          url: req.url,
        }),
      },
    },
  };
}
