import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/**/*.test.ts", "apps/**/*.test.{ts,tsx}", "examples/**/*.test.ts"],
    exclude: ["**/*.integration.test.{ts,tsx}", "**/node_modules/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
    },
  },
});
