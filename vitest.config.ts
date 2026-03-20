import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      // server-only 在測試環境不需要，mock 掉
      "server-only": path.resolve(__dirname, "src/__tests__/server-only-mock.ts"),
    },
  },
});
