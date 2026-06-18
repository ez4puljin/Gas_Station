import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/** Энэ route-д JWT шаардахгүй (ж: login, health). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
