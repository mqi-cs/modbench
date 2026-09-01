import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Modbench — Seiko mod compatibility",
  description:
    "Check whether Seiko mod parts actually go together, across four vendors, before you order. Blocked combinations stay visible with the reason.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;450;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
