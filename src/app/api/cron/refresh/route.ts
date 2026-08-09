import { NextResponse, type NextRequest } from "next/server";
import { env, optionalEnv, secretEquals } from "@/lib/env";
import {
  KakaoError,
  refreshTokens,
  writeRefreshStatus,
  type RefreshStatus,
} from "@/lib/kakao";
import { sendAdminAlert } from "@/lib/email";
import { formatKst } from "@/lib/notify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Below this many days left on the refresh token, something has gone wrong with
 * the daily refresh — a healthy token never drops under ~30.
 */
const WARN_DAYS_REMAINING = 7;
const DAY_MS = 24 * 3600 * 1000;

function authorized(request: NextRequest): boolean {
  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const cronSecret = optionalEnv("CRON_SECRET", "");
  if (cronSecret && secretEquals(bearer, cronSecret)) return true;
  // Manual runs from a browser or curl during setup.
  return secretEquals(request.nextUrl.searchParams.get("key"), env("ADMIN_SECRET"));
}

/**
 * Daily keep-alive. Kakao refresh tokens die after 60 unused days and are only
 * reissued once they drop under a month of validity, so refreshing every day is
 * what makes a button that might not be pressed for half a year still work.
 */
export async function GET(request: NextRequest): Promise<Response> {
  if (!authorized(request)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const at = new Date().toISOString();

  try {
    const state = await refreshTokens();
    const daysRemaining = Math.floor((state.refreshTokenExpiresAt - Date.now()) / DAY_MS);
    const status: RefreshStatus = { at, ok: true, daysRemaining };
    await writeRefreshStatus(status);

    if (daysRemaining < WARN_DAYS_REMAINING) {
      await alert(
        "리프레시 토큰 만료 임박",
        [
          `남은 기간: ${daysRemaining}일`,
          `만료 예정: ${formatKst(new Date(state.refreshTokenExpiresAt))} (KST)`,
          "",
          "/api/auth/kakao/start?key=<ADMIN_SECRET> 로 다시 연동하세요.",
        ].join("\n"),
      );
    }

    return NextResponse.json(status);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const needsReauth = error instanceof KakaoError && error.needsReauth;
    const status: RefreshStatus = { at, ok: false, error: message };
    await writeRefreshStatus(status);

    await alert(
      needsReauth ? "재연동 필요 — 토큰이 만료되었습니다" : "토큰 갱신 실패",
      [
        message,
        error instanceof KakaoError && error.detail ? error.detail : "",
        "",
        needsReauth
          ? "/api/auth/kakao/start?key=<ADMIN_SECRET> 로 다시 연동하세요. 그때까지 카카오 알림은 나가지 않고 이메일만 옵니다."
          : "일시적 오류일 수 있습니다. 내일 크론에서 자동 재시도합니다.",
      ].join("\n"),
    );

    return NextResponse.json(status, { status: 500 });
  }
}

/** An alert that cannot be delivered must not turn into a 500 of its own. */
async function alert(subject: string, body: string): Promise<void> {
  try {
    await sendAdminAlert(subject, body);
  } catch (error) {
    console.error("Failed to send admin alert", error);
  }
}
