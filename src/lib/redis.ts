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
  /** LPUSH'd JSON entries, one per page open. */
  visitLog: "visit:log",
  /** Every real page open, including the ones whose alert was throttled. */
  visitCount: "visit:count",
  /** Present while an address is inside its alert throttle window. */
  visitSeen: (ip: string) => `visit:seen:${ip}`,
  /** How many times one browser has opened the page. */
  deviceCount: (deviceId: string) => `visit:device:${deviceId}`,
} as const;
