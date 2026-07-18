import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import localFont from "next/font/local";
import "./globals.css";

/* Tanker (Fontshare, free licence) — the matchday-poster display voice */
const tanker = localFont({
  src: "./tanker.woff2",
  variable: "--font-tanker",
  display: "swap",
});

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
const DESCRIPTION = "Live watch-along for the 2026 World Cup. Reactions, polls, rivalries, proof-verified results.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: "Terrace — watch the World Cup together", template: "%s · Terrace" },
  description: DESCRIPTION,
  openGraph: {
    title: "Terrace — watch the World Cup together",
    description: DESCRIPTION,
    url: "/",
    siteName: "Terrace",
    type: "website",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "Terrace — watch the World Cup with the whole terrace" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Terrace — watch the World Cup together",
    description: DESCRIPTION,
    images: ["/og.png"],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable} ${tanker.variable}`}>
      <body className="font-sans">{children}</body>
    </html>
  );
}
