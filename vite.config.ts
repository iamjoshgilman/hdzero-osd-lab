import { defineConfig } from "vite";
import preact from "@preact/preset-vite";
import path from "node:path";
import { readFileSync } from "node:fs";

// Pull the version from package.json at build time so the in-app tag in the
// top bar always matches whatever we published. One source of truth.
const pkg = JSON.parse(
  readFileSync(path.resolve(__dirname, "package.json"), "utf8"),
) as { version: string };

export default defineConfig({
  plugins: [preact()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  base: process.env.VITE_BASE_PATH ?? "/",
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  server: {
    port: 5173,
    strictPort: false,
  },
  build: {
    target: "es2022",
    sourcemap: true,
  },
});
