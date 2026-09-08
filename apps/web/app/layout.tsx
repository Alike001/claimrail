import type { Metadata } from "next";
import { IBM_Plex_Mono, Instrument_Serif, Manrope } from "next/font/google";
import { headers } from "next/headers";
import type { ReactNode } from "react";
import { cookieToInitialState } from "wagmi";
import { getWagmiConfig } from "@/src/wallet/config";
import { Providers } from "@/src/wallet/providers";
import "./globals.css";

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
  display: "swap",
});

const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-instrument-serif",
  display: "swap",
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-ibm-plex-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "ClaimRail — Find and claim finished DreamDEX positions",
    template: "%s | ClaimRail",
  },
  description:
    "See what happened to your DreamDEX positions, find funds ready to claim, and collect them safely with your own wallet.",
};

export default async function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  const initialState = cookieToInitialState(
    getWagmiConfig(),
    (await headers()).get("cookie") ?? undefined,
  );
  return (
    <html
      lang="en"
      className={`${manrope.variable} ${instrumentSerif.variable} ${ibmPlexMono.variable}`}
    >
      <body>
        <a className="skip-link" href="#main-content">
          Skip to content
        </a>
        <Providers initialState={initialState}>{children}</Providers>
      </body>
    </html>
  );
}
