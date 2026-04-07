import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  assetsInclude: ["**/*.vrm", "**/*.vrma"],
  base: "./",
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true
  },
  build: {
    sourcemap: true
  },
  test: {
    environment: "node"
  }
});
