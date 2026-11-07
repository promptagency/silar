/// <reference types="vitest/config" />
import { readFileSync } from "node:fs";
import { join } from "node:path";
import react from "@vitejs/plugin-react";
import { build, defineConfig, type Plugin } from "vite";
import { buildSwManifest } from "./scripts/swManifest.ts";
import { shellFiles } from "./src/sw/core.ts";

// Privacy: after load the page may only talk to its own origin.
// frame-ancestors cannot be set from a meta tag; public/_headers adds it.
export const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "connect-src 'self'",
  "worker-src 'self'",
  "img-src 'self' data:",
  "style-src 'self'",
  "font-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join("; ");

// Build only: Vite's dev server injects inline scripts the CSP would block.
function cspMeta(): Plugin {
  return {
    name: "csp-meta",
    apply: "build",
    transformIndexHtml: () => [{ tag: "meta", attrs: { "http-equiv": "Content-Security-Policy", content: CSP }, injectTo: "head-prepend" }],
  };
}

// After the app is built, build the service worker into dist/sw.js as a
// classic script, with the content revision of every file in dist/ and the
// files index.html loads baked in. Copied from Skrubba's vite.config.ts.
function serviceWorker(): Plugin {
  let outDir = "dist";
  return {
    name: "service-worker",
    apply: "build",
    configResolved(config) {
      outDir = config.build.outDir;
    },
    async closeBundle() {
      await build({
        configFile: false,
        logLevel: "warn",
        define: {
          __SW_MANIFEST__: JSON.stringify(buildSwManifest(outDir)),
          __SW_SHELL__: JSON.stringify(shellFiles(readFileSync(join(outDir, "index.html"), "utf8"))),
        },
        build: {
          outDir,
          emptyOutDir: false,
          copyPublicDir: false,
          lib: { entry: "src/sw/sw.ts", formats: ["iife"], name: "sw", fileName: () => "sw.js" },
        },
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), cspMeta(), serviceWorker()],
  worker: { format: "es" },
  test: { include: ["tests/**/*.test.ts"], testTimeout: 30_000 },
});
