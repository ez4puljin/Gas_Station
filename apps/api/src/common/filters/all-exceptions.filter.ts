import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import type { Request, Response } from 'express';
import type { ApiError } from '@fuel/types';
import { zodToDetails } from '../zod/zod.util';

/**
 * Бүх алдааг барьж нэгдсэн ApiError болгоно — CLAUDE.md §14.
 * Хэрэглэгчид Монгол мессеж; дотооддоо англиар бүрэн логлоно.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exception');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request & { id?: string }>();
    const correlationId =
      (req.headers['x-correlation-id'] as string | undefined) ?? req.id ?? undefined;

    let status: number = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL_ERROR';
    let message = 'Дотоод алдаа гарлаа';
    let details: Record<string, string[]> | undefined;

    if (exception instanceof ZodError) {
      status = HttpStatus.BAD_REQUEST;
      code = 'VALIDATION_ERROR';
      message = 'Оролтын мэдээлэл буруу байна';
      details = zodToDetails(exception);
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const response = exception.getResponse();
      if (typeof response === 'string') {
        message = response;
        code = statusToCode(status);
      } else if (response && typeof response === 'object') {
        const r = response as Record<string, unknown>;
        code = typeof r.code === 'string' ? r.code : statusToCode(status);
        if (Array.isArray(r.message)) message = (r.message as string[]).join(', ');
        else if (typeof r.message === 'string') message = r.message;
        if (r.details && typeof r.details === 'object') {
          details = r.details as Record<string, string[]>;
        }
      }
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      ({ status, code, message } = mapPrismaError(exception));
    }

    const errForLog = exception instanceof Error ? exception : new Error(String(exception));
    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error({ err: errForLog, correlationId, path: req.url }, errForLog.message);
    } else {
      this.logger.warn({ correlationId, code, path: req.url }, errForLog.message);
    }

    const body: ApiError = { statusCode: status, code, message, correlationId, details };
    res.status(status).json(body);
  }
}

function statusToCode(status: number): string {
  switch (status) {
    case HttpStatus.BAD_REQUEST:
      return 'BAD_REQUEST';
    case HttpStatus.UNAUTHORIZED:
      return 'UNAUTHORIZED';
    case HttpStatus.FORBIDDEN:
      return 'FORBIDDEN';
    case HttpStatus.NOT_FOUND:
      return 'NOT_FOUND';
    case HttpStatus.CONFLICT:
      return 'CONFLICT';
    default:
      return 'ERROR';
  }
}

function mapPrismaError(e: Prisma.PrismaClientKnownRequestError): {
  status: number;
  code: string;
  message: string;
} {
  switch (e.code) {
    case 'P2002':
      return { status: HttpStatus.CONFLICT, code: 'CONFLICT', message: 'Давхардсан утга байна' };
    case 'P2025':
      return { status: HttpStatus.NOT_FOUND, code: 'NOT_FOUND', message: 'Бичлэг олдсонгүй' };
    case 'P2003':
      return {
        status: HttpStatus.BAD_REQUEST,
        code: 'FK_CONSTRAINT',
        message: 'Холбоост өгөгдөл буруу байна',
      };
    default:
      return {
        status: HttpStatus.BAD_REQUEST,
        code: 'DB_ERROR',
        message: 'Өгөгдлийн сангийн алдаа',
      };
  }
}
