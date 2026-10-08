"use client";

import { ConvexProvider, ConvexReactClient } from "convex/react";
import { ThemeProvider } from "next-themes";
import type { ReactNode } from "react";

// Without a deployment URL the app still renders; pages that query Convex
// are the ones that need it.
const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
const convex = convexUrl ? new ConvexReactClient(convexUrl) : null;

export function Providers({ children }: { children: ReactNode }) {
  const themed = (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
      {children}
    </ThemeProvider>
  );
  return convex ? <ConvexProvider client={convex}>{themed}</ConvexProvider> : themed;
}
