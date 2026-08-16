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
 * True the first time this exact submission is seen, false for a repeat of it.
 *
 * Keyed on an id the browser mints per press attempt, deliberately not on a
 * time window: a window cannot tell a double-fire of one tap from a second tap
 * the person actually meant — and after the undo button, pressing again a few
 * seconds later is a real thing to do, not an accident to swallow.
 *
 * A retry of the *same* attempt keeps its id, so a press whose response got
 * lost still can't be delivered twice.
 */
export async function claimPressSlot(pressId: string, ttlSeconds: number): Promise<boolean> {
  if (!pressId) return true;
  try {
    const claimed = await redis().set(KEYS.pressDedupe(pressId), Date.now(), {
      nx: true,
      ex: ttlSeconds,
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
