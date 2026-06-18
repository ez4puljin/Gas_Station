import { SetMetadata } from '@nestjs/common';

export const THROTTLE_KEY = 'throttle';

export interface ThrottleOptions {
  /** Хугацааны цонхонд зөвшөөрөх дээд оролдлого */
  limit: number;
  /** Цонхны урт (секунд) */
  ttlSeconds: number;
}

/** Redis-д суурилсан rate limit — нэвтрэх/эмзэг endpoint дээр (CLAUDE.md §11). */
export const Throttle = (options: ThrottleOptions) => SetMetadata(THROTTLE_KEY, options);
