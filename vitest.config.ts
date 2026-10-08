import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // convex-test runs Convex functions in the edge runtime, like Convex does.
    environment: "edge-runtime",
    server: { deps: { inline: ["convex-test"] } },
  },
});
