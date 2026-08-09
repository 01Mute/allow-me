import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { env, secretEquals } from "@/lib/env";
import { OAUTH_STATE_COOKIE, buildAuthorizeUrl } from "@/lib/kakao";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * One-time owner-only flow: sends the owner to Kakao's consent screen so the
 * app can hold a refresh token for their own account.
 */
export async function GET(request: NextRequest): Promise<Response> {
  if (!secretEquals(request.nextUrl.searchParams.get("key"), env("ADMIN_SECRET"))) {
    return new NextResponse("Not found", { status: 404 });
  }

  const state = randomBytes(16).toString("base64url");
  const response = NextResponse.redirect(buildAuthorizeUrl(state));
  response.cookies.set(OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: request.nextUrl.protocol === "https:",
    path: "/",
    maxAge: 600,
  });
  return response;
}
