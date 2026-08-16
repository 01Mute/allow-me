import { NextResponse } from "next/server";
import { MESSAGE_MAX_LENGTH } from "@/lib/constants";
import { env, secretEquals } from "@/lib/env";
import { appendPressLog, notifyPress } from "@/lib/notify";
import { claimPressSlot, clientIp, rateLimit } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Only here to stop someone who found the link from firing it over and over.
 * Set well above anything real use could reach — she can undo and press again
 * as many times as she likes without ever meeting it.
 */
const RATE_LIMIT = { limit: 30, windowSeconds: 3600 };
/** How long a submission id is remembered, to catch a resend of that attempt. */
const DEDUPE_TTL_SECONDS = 60 * 60;

export async function POST(request: Request): Promise<Response> {
  let body: { slug?: unknown; message?: unknown; pressId?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const slug = typeof body.slug === "string" ? body.slug : "";
  if (!secretEquals(slug, env("SECRET_SLUG"))) {
    return NextResponse.json({ ok: false }, { status: 404 });
  }

  const message =
    typeof body.message === "string" ? body.message.trim().slice(0, MESSAGE_MAX_LENGTH) : "";
  const pressId = typeof body.pressId === "string" ? body.pressId.slice(0, 64) : "";
  const ip = clientIp(request.headers);
  const userAgent = request.headers.get("user-agent") ?? undefined;

  // A submission that gets dropped is still written to the log. Silently
  // discarding a press is the one outcome this project cannot afford.
  const { allowed, count } = await rateLimit(ip, RATE_LIMIT);
  if (!allowed) {
    console.error(`Press dropped: rate limit hit (${count} from ${ip})`);
    await appendPressLog({
      at: new Date().toISOString(),
      message,
      ip,
      userAgent,
      telegram: `dropped: rate limit (${count})`,
      email: `dropped: rate limit (${count})`,
    });
    return NextResponse.json({ ok: true, dropped: "rate-limit" });
  }

  if (!(await claimPressSlot(pressId, DEDUPE_TTL_SECONDS))) {
    // The same attempt arriving twice — already delivered, nothing to do.
    return NextResponse.json({ ok: true, duplicate: true });
  }

  await notifyPress(message, { ip, userAgent });

  // notifyPress never throws and records its own failures. The person pressing
  // the button always sees success; recovery is the owner's problem, not theirs.
  return NextResponse.json({ ok: true });
}
