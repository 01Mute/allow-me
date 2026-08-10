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
  // The page is black in every theme, so the browser chrome should be too.
  themeColor: "#000000",
  colorScheme: "dark",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className="bg-canvas text-ink min-h-dvh">{children}</body>
    </html>
  );
}
