import type { Metadata, Viewport } from "next";
import { Gaegu } from "next/font/google";
import "./globals.css";

// Soft Korean handwriting for the few lines of copy, like pencil on paper.
// Korean glyphs are served by unicode-range slices, so nothing to preload.
const hand = Gaegu({
  weight: ["400", "700"],
  subsets: ["latin"],
  display: "swap",
  preload: false,
  variable: "--font-hand",
});

export const metadata: Metadata = {
  title: " ",
  // Nothing here should ever be indexed, linked from a preview card, or show up
  // in a search result.
  robots: { index: false, follow: false, nocache: true },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Matches the paper, so the browser chrome blends in.
  themeColor: "#fbf8f3",
  colorScheme: "light",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className={hand.variable}>
      <body className="bg-canvas text-ink min-h-dvh">{children}</body>
    </html>
  );
}
