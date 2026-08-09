import { NextResponse, type NextRequest } from "next/server";
import { OAUTH_STATE_COOKIE, exchangeAuthorizationCode } from "@/lib/kakao";
import { formatKst } from "@/lib/notify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function page(title: string, detail: string, status: number): NextResponse {
  const body = `<!doctype html><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<body style="font:16px/1.6 system-ui,sans-serif;max-width:34rem;margin:4rem auto;padding:0 1.5rem">
<h1 style="font-size:1.25rem">${title}</h1>
<p style="color:#555;white-space:pre-wrap">${detail}</p>
</body>`;
  return new NextResponse(body, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}

export async function GET(request: NextRequest): Promise<Response> {
  const params = request.nextUrl.searchParams;

  const kakaoError = params.get("error");
  if (kakaoError) {
    return page(
      "연동 실패",
      `카카오가 거부했습니다: ${escapeHtml(kakaoError)}\n${escapeHtml(params.get("error_description") ?? "")}`,
      400,
    );
  }

  const state = params.get("state");
  const expectedState = request.cookies.get(OAUTH_STATE_COOKIE)?.value;
  if (!state || !expectedState || state !== expectedState) {
    return page("연동 실패", "state 값이 일치하지 않습니다. /api/auth/kakao/start 부터 다시 시작하세요.", 400);
  }

  const code = params.get("code");
  if (!code) return page("연동 실패", "authorization code가 없습니다.", 400);

  try {
    const tokens = await exchangeAuthorizationCode(code);
    const response = page(
      "연동 완료",
      [
        "카카오톡 알림을 보낼 준비가 되었습니다.",
        "",
        `리프레시 토큰 만료 예정: ${formatKst(new Date(tokens.refreshTokenExpiresAt))} (KST)`,
        "매일 도는 크론이 이 만료일을 계속 뒤로 밀어줍니다.",
      ].join("\n"),
      200,
    );
    response.cookies.delete(OAUTH_STATE_COOKIE);
    return response;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return page("연동 실패", escapeHtml(detail), 500);
  }
}
