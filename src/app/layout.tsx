import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: " ",
  // Nothing here should ever be indexed, linked from a preview card, or show up
  // in a search result.
  robots: { index: false, follow: false, nocache: true },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fdf9f6" },
    { media: "(prefers-color-scheme: dark)", color: "#15120f" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className="bg-canvas text-ink min-h-dvh">{children}</body>
    </html>
  );
}
