import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import "./globals.css";

// Self-hosted at build time rather than linked from fonts.googleapis.com.
// The stylesheet link was render-blocking on a third-party origin and cost
// 1.94s of the build page's first paint, holding Lighthouse performance at
// 79 against the >=90 bar. next/font inlines the face declarations and
// serves the files from our own origin, so there is no extra round trip
// and no flash of unstyled text.
const sans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-sans",
  display: "swap",
});
const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-mono",
  display: "swap",
});

export const metadata: Metadata = {
  // Link previews need absolute URLs: without a base, Next emits og:url
  // and og:image as site-relative paths, which Slack and Discord cannot
  // resolve and simply drop -- the card renders with no image and no link.
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: "Modbench — Seiko mod compatibility",
  description:
    "Check whether Seiko mod parts actually go together, across four vendors, before you order. Blocked combinations stay visible with the reason.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB" className={`${sans.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
