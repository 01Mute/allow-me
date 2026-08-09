import { notFound } from "next/navigation";
import { env, secretEquals } from "@/lib/env";
import PressButton from "./PressButton";

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

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-6 py-16">
      <PressButton slug={slug} />
    </main>
  );
}
