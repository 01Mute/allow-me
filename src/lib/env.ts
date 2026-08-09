/**
 * Environment access.
 *
 * Everything is read lazily at request time, never at module load — `next build`
 * evaluates modules without the production environment, and a top-level throw
 * would turn a missing variable into a broken build instead of a clear error.
 */

export const REQUIRED_ENV = [
  "TELEGRAM_BOT_TOKEN",
  "TELEGRAM_CHAT_ID",
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN",
  "RESEND_API_KEY",
  "NOTIFY_EMAIL_TO",
  "SECRET_SLUG",
  "ADMIN_SECRET",
] as const;

export type RequiredEnvName = (typeof REQUIRED_ENV)[number];

export class MissingEnvError extends Error {
  constructor(name: string) {
    super(`Missing required environment variable: ${name}`);
    this.name = "MissingEnvError";
  }
}

export function env(name: RequiredEnvName): string {
  const value = process.env[name];
  if (!value) throw new MissingEnvError(name);
  return value;
}

export function optionalEnv(name: string, fallback: string): string {
  return process.env[name] || fallback;
}

/** Names of required variables that are not set. Used by /api/admin/status. */
export function missingEnv(): RequiredEnvName[] {
  return REQUIRED_ENV.filter((name) => !process.env[name]);
}

export function emailFrom(): string {
  return optionalEnv("RESEND_FROM", "onboarding@resend.dev");
}

export function siteUrl(): string {
  return optionalEnv("NEXT_PUBLIC_SITE_URL", "https://example.com").replace(/\/+$/, "");
}

/**
 * Length-independent string comparison for secrets that arrive in URLs.
 * Not a true constant-time compare (JS string access isn't), but it removes the
 * trivial early-exit signal and costs nothing here.
 */
export function secretEquals(a: string | null | undefined, b: string): boolean {
  if (!a) return false;
  const encoder = new TextEncoder();
  const left = encoder.encode(a);
  const right = encoder.encode(b);
  let diff = left.length ^ right.length;
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    diff |= (left[i] ?? 0) ^ (right[i] ?? 0);
  }
  return diff === 0;
}
