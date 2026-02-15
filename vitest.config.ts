import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./src/test/setup.ts"],
    globals: true,
    restoreMocks: true,
    clearMocks: true,
    mockReset: true,

    // Only run unit/integration tests with Vitest
    include: [
      "src/**/*.{test,spec}.ts",
      "src/**/*.{test,spec}.tsx",
    ],
    exclude: [
      "e2e/**",
      "node_modules/**",
      "dist/**",
      ".next/**",
    ],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
