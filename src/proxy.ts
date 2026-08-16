import { NextResponse, type NextRequest } from "next/server";
import { DEVICE_COOKIE, DEVICE_HEADER } from "@/lib/constants";

/**
 * Hands every browser a stable id so a visit can be told apart from a revisit.
 *
 * This has to live here rather than in the page: a Server Component can read
 * cookies but cannot set them, and the id is needed on the very first request,
 * before there is anything to read.
 *
 * It identifies a *browser*, not a phone. Clearing site data, private browsing,
 * or opening the link in a different app on the same phone all produce a new id.
 * A device's hardware address is not obtainable from a web server at all.
 */

const ONE_YEAR_SECONDS = 365 * 24 * 60 * 60;

export function proxy(request: NextRequest): NextResponse {
  const existing = request.cookies.get(DEVICE_COOKIE)?.value;
  const deviceId = existing ?? crypto.randomUUID().replace(/-/g, "").slice(0, 16);

  // Forward it on this request too, so a first visit is not reported anonymously.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(DEVICE_HEADER, deviceId);
  if (!existing) requestHeaders.set(`${DEVICE_HEADER}-new`, "1");

  const response = NextResponse.next({ request: { headers: requestHeaders } });

  if (!existing) {
    response.cookies.set(DEVICE_COOKIE, deviceId, {
      httpOnly: true,
      sameSite: "lax",
      secure: request.nextUrl.protocol === "https:",
      path: "/",
      maxAge: ONE_YEAR_SECONDS,
    });
  }

  return response;
}

export const config = {
  // Only the button page. Nothing else needs to know who is asking.
  matcher: "/w/:path*",
};
