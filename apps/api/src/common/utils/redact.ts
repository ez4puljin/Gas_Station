/**
 * Эмзэг талбарыг гүн гүнзгий redact хийнэ — CLAUDE.md §2.5, §8.
 * Audit-ийн before/after болон лог-д бичихээс өмнө дамжуулна.
 *
 * Түлхүүрийг normalize (тусгаарлагч хасч, жижиг үсэг) болгоод дэд-мөрөөр шалгана —
 * ингэснээр snake_case (card_number), camelCase (cardNumber), угтвар/дагавартай
 * (hashedPassword, refresh_token) бүх хувилбарыг адил барина.
 */
const SENSITIVE_TOKENS = [
  'password',
  'token',
  'secret',
  'pan',
  'cardnumber',
  'cvv',
  'cvc',
  'pin',
  'otp',
  'authorization',
  'apikey',
];

const REDACTED = '[REDACTED]';

function isSensitiveKey(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, '');
  return SENSITIVE_TOKENS.some((t) => normalized.includes(t));
}

export function redactDeep(value: unknown, seen = new WeakSet<object>()): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (seen.has(value)) return '[Circular]';
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => redactDeep(item, seen));
  }

  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    if (isSensitiveKey(key)) {
      result[key] = REDACTED;
    } else {
      result[key] = redactDeep(val, seen);
    }
  }
  return result;
}
