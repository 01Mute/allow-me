import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { after } from "next/server";
import { env, secretEquals } from "@/lib/env";
import { notifyVisit, readVisitInfo } from "@/lib/visit";
import PressButton from "./PressButton";
import TallyWall from "./TallyWall";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function ButtonPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  // A wrong slug is a 404, not a "wrong password" — the page shouldn't confirm
  // that anything exists at this address.
  if (!secretEquals(slug, env("SECRET_SLUG"))) notFound();

  // Read the request data here: a Server Component cannot reach `headers()`
  // from inside `after`, so the values have to be captured and handed over.
  const visit = readVisitInfo(await headers());
  // Runs once the page has already been sent, so the alert never delays her.
  after(() => notifyVisit(visit));

  return (
    <>
      <TallyWall />
      <main className="relative z-10 mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-6 py-16">
        <PressButton slug={slug} />
      </main>
    </>
  );
}
