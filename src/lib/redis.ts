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

export const KEYS = {
  /** LPUSH'd JSON entries, one per button press. */
  pressLog: "press:log",
  /** Set for a short window after a press, to swallow double submissions. */
  pressDedupe: "press:dedupe",
  /** Per-IP sliding counter. */
  rateLimit: (ip: string) => `press:rate:${ip}`,
} as const;
