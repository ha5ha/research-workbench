import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@research-workbench/contracts": resolve("packages/contracts/src/index.ts"),
      "@research-workbench/domain": resolve("packages/domain/src/index.ts"),
      "@research-workbench/research-skills": resolve("packages/research-skills/src/index.ts"),
      "@research-workbench/agent-runtime": resolve("packages/agent-runtime/src/index.ts"),
      "@research-workbench/core": resolve("apps/core/src/index.ts")
    }
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    testTimeout: 20_000
  }
});
