"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { WagmiProvider, type State } from "wagmi";
import { getWagmiConfig } from "./config";

export function Providers({
  children,
  initialState,
}: {
  readonly children: ReactNode;
  readonly initialState?: State | undefined;
}) {
  const [config] = useState(getWagmiConfig);
  const [queryClient] = useState(() => new QueryClient());
  return (
    <WagmiProvider config={config} initialState={initialState} reconnectOnMount>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
