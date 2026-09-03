import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "src/**/*.integration.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      include: ["src/**/*.ts"],
      exclude: [
        "src/**/*.test.ts",
        "src/test-support/**",
        "src/index.ts",
        "src/chain/types.ts",
        "src/chain/gateway.ts",
        "src/smoke/**",
      ],
      thresholds: {
        lines: 85,
        functions: 85,
        statements: 85,
        branches: 60,
      },
    },
  },
});
