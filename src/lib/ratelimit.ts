import { KEYS, redis } from "./redis";

/**
 * Fixed-window counter. Precise enough for its only job: keeping someone who
 * found the link from firing the notification over and over.
 */
export async function rateLimit(
  ip: string,
  { limit, windowSeconds }: { limit: number; windowSeconds: number },
): Promise<{ allowed: boolean; count: number }> {
  try {
    const key = KEYS.rateLimit(ip);
    const count = await redis().incr(key);
    if (count === 1) await redis().expire(key, windowSeconds);
    return { allowed: count <= limit, count };
  } catch (error) {
    // A Redis hiccup must not block a real press.
    console.error("Rate limit check failed, allowing request", error);
    return { allowed: true, count: 0 };
  }
}

/**
 * True the first time it is called within `windowSeconds`, false afterwards.
 * Collapses the double-taps and retries that a single press can produce.
 */
export async function claimPressSlot(windowSeconds: number): Promise<boolean> {
  try {
    const claimed = await redis().set(KEYS.pressDedupe, Date.now(), {
      nx: true,
      ex: windowSeconds,
    });
    return claimed !== null;
  } catch (error) {
    console.error("Dedupe check failed, allowing request", error);
    return true;
  }
}

export function clientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return headers.get("x-real-ip") ?? "unknown";
}
