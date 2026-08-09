import { NextResponse, type NextRequest } from "next/server";
import { env, missingEnv, secretEquals, siteUrl } from "@/lib/env";
import { readRefreshStatus, readTokenState } from "@/lib/kakao";
import { clearPressLog, formatKst, readPressLog } from "@/lib/notify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DAY_MS = 24 * 3600 * 1000;

function authorized(request: NextRequest): boolean {
  return secretEquals(request.nextUrl.searchParams.get("key"), env("ADMIN_SECRET"));
}

/** Owner's dashboard: is this thing still armed, and has it ever fired? */
export async function GET(request: NextRequest): Promise<Response> {
  if (!authorized(request)) return NextResponse.json({ ok: false }, { status: 404 });

  const missing = missingEnv();
  const tokens = await readTokenState().catch(() => null);
  const refresh = await readRefreshStatus().catch(() => null);
  const presses = await readPressLog(50).catch(() => []);

  return NextResponse.json({
    ok: missing.length === 0 && Boolean(tokens),
    missingEnv: missing,
    buttonUrl: `${siteUrl()}/w/${env("SECRET_SLUG")}`,
    kakao: tokens
      ? {
          connected: true,
          connectedAt: formatKst(new Date(tokens.connectedAt)),
          refreshTokenExpiresAt: formatKst(new Date(tokens.refreshTokenExpiresAt)),
          refreshTokenDaysRemaining: Math.floor(
            (tokens.refreshTokenExpiresAt - Date.now()) / DAY_MS,
          ),
          accessTokenExpiresAt: tokens.accessTokenExpiresAt
            ? formatKst(new Date(tokens.accessTokenExpiresAt))
            : null,
        }
      : { connected: false, hint: "/api/auth/kakao/start?key=<ADMIN_SECRET>" },
    lastRefresh: refresh,
    pressCount: presses.length,
    presses,
  });
}

/** Wipes the press log — used to clear out test presses before going live. */
export async function DELETE(request: NextRequest): Promise<Response> {
  if (!authorized(request)) return NextResponse.json({ ok: false }, { status: 404 });
  await clearPressLog();
  return NextResponse.json({ ok: true, cleared: "press log" });
}
