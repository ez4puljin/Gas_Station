import type { ZodError } from 'zod';

/** ZodError → талбар бүрийн алдааны map (ApiError.details). */
export function zodToDetails(error: ZodError): Record<string, string[]> {
  const details: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.length > 0 ? issue.path.join('.') : '_';
    (details[key] ??= []).push(issue.message);
  }
  return details;
}
