import { BadRequestException, Injectable, type PipeTransform } from '@nestjs/common';
import type { ZodSchema } from 'zod';
import { zodToDetails } from '../zod/zod.util';

/**
 * Zod-оор баталгаажуулах pipe — CLAUDE.md §11, §14 (бүх input Zod).
 * Хэрэглээ: `@Body(new ZodValidationPipe(loginSchema)) dto: LoginInput`
 */
@Injectable()
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodSchema<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Оролтын мэдээлэл буруу байна',
        details: zodToDetails(result.error),
      });
    }
    return result.data;
  }
}
