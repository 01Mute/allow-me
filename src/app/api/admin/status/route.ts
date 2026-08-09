import { NextResponse, type NextRequest } from "next/server";
import { env, missingEnv, secretEquals, siteUrl } from "@/lib/env";
import { clearPressLog, readPressLog } from "@/lib/notify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(request: NextRequest): boolean {
  return secretEquals(request.nextUrl.searchParams.get("key"), env("ADMIN_SECRET"));
}

/** Owner's dashboard: is this thing still armed, and has it ever fired? */
export async function GET(request: NextRequest): Promise<Response> {
  if (!authorized(request)) return NextResponse.json({ ok: false }, { status: 404 });

  const missing = missingEnv();
  const presses = await readPressLog(50).catch(() => []);

  return NextResponse.json({
    ok: missing.length === 0,
    missingEnv: missing,
    buttonUrl: `${siteUrl()}/w/${env("SECRET_SLUG")}`,
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
