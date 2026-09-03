import type { Metadata } from "next";
import { headers } from "next/headers";
import type { ReactNode } from "react";
import { cookieToInitialState } from "wagmi";
import { getWagmiConfig } from "@/src/wallet/config";
import { Providers } from "@/src/wallet/providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "ClaimRail",
  description: "Settlement and notification infrastructure for DreamDEX Event Contracts.",
};

export default async function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  const initialState = cookieToInitialState(
    getWagmiConfig(),
    (await headers()).get("cookie") ?? undefined,
  );
  return (
    <html lang="en">
      <body>
        <Providers initialState={initialState}>{children}</Providers>
      </body>
    </html>
  );
}
