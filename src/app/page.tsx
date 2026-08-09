import { notFound } from "next/navigation";

/**
 * The root gives nothing away. Anyone who lands here without the secret path
 * should see exactly what they would see for any other wrong URL.
 */
export default function Home() {
  notFound();
}
