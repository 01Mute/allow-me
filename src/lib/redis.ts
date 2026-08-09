import { Redis } from "@upstash/redis";
import { env } from "./env";

let client: Redis | null = null;

export function redis(): Redis {
  if (!client) {
    client = new Redis({
      url: env("UPSTASH_REDIS_REST_URL"),
      token: env("UPSTASH_REDIS_REST_TOKEN"),
    });
  }
  return client;
}

/** Reset the memoized client. Tests only. */
export function resetRedisClient(): void {
  client = null;
}

export const KEYS = {
  /** Single JSON document holding the Kakao token state. */
  tokens: "kakao:tokens",
  /** SET NX lock held while refreshing, so a race can't clobber a rotated refresh token. */
  refreshLock: "kakao:refresh_lock",
  /** Outcome of the most recent cron run, for /api/admin/status. */
  refreshStatus: "kakao:refresh_status",
  /** LPUSH'd JSON entries, one per button press. */
  pressLog: "press:log",
  /** Set for a short window after a press, to swallow double submissions. */
  pressDedupe: "press:dedupe",
  /** Per-IP sliding counter. */
  rateLimit: (ip: string) => `press:rate:${ip}`,
} as const;
