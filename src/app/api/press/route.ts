import { NextResponse } from "next/server";
import { MESSAGE_MAX_LENGTH } from "@/lib/constants";
import { env, secretEquals } from "@/lib/env";
import { notifyPress } from "@/lib/notify";
import { claimPressSlot, clientIp, rateLimit } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Generous enough for a retry, tight enough that the link can't be spammed. */
const RATE_LIMIT = { limit: 5, windowSeconds: 3600 };
/** Double-taps and client retries inside this window count as one press. */
const DEDUPE_WINDOW_SECONDS = 60;

export async function POST(request: Request): Promise<Response> {
  let body: { slug?: unknown; message?: unknown };
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
  const ip = clientIp(request.headers);

  const { allowed } = await rateLimit(ip, RATE_LIMIT);
  if (!allowed) {
    // Report success anyway — the first press already went through, and there is
    // nothing useful for the presser to do about a rate limit.
    return NextResponse.json({ ok: true, duplicate: true });
  }

  if (!(await claimPressSlot(DEDUPE_WINDOW_SECONDS))) {
    return NextResponse.json({ ok: true, duplicate: true });
  }

  await notifyPress(message, {
    ip,
    userAgent: request.headers.get("user-agent") ?? undefined,
  });

  // notifyPress never throws and records its own failures. The person pressing
  // the button always sees success; recovery is the owner's problem, not theirs.
  return NextResponse.json({ ok: true });
}
