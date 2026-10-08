import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // The same "@/*" -> repo root mapping as tsconfig.json.
  resolve: { alias: { "@": path.resolve(__dirname) } },
  test: {
    // convex-test runs Convex functions in the edge runtime, like Convex does.
    environment: "edge-runtime",
    server: { deps: { inline: ["convex-test"] } },
  },
});
