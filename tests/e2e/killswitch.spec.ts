import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { extname, join } from "node:path";
import { expect, test } from "@playwright/test";

const DIST = new URL("../../dist/", import.meta.url).pathname;
const TYPES: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml" };

test("a kill switch build clears a returning visitor's cache and removes the service worker", async ({ page }, info) => {
  // One setup is enough, and two would build into the same place at once.
  test.skip(info.project.name !== "chromium", "service worker test runs in Chromium");
  test.setTimeout(120_000);
  const killBuild = info.outputPath("kill-build");
  execFileSync("npx", ["vite", "build", "--outDir", killBuild, "--emptyOutDir", "--logLevel", "error"], { env: { ...process.env, SW_KILL: "1" } });

  // Two deploys at one address: the folder served is swapped below.
  let root = DIST;
  const server = createServer(async (req, res) => {
    const path = new URL(req.url ?? "/", "http://x").pathname;
    const file = join(root, path === "/" ? "index.html" : path);
    try {
      const body = await readFile(file);
      res.writeHead(200, { "Content-Type": TYPES[extname(file)] ?? "application/octet-stream" }).end(body);
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise<void>((done) => server.listen(0, done));
  const address = `http://localhost:${(server.address() as AddressInfo).port}/`;

  // During the handover the page navigates; a read that hits that just counts as "not yet".
  const counts = () =>
    page.evaluate(async () => ({ caches: (await caches.keys()).length, workers: (await navigator.serviceWorker.getRegistrations()).length })).catch(() => null);

  try {
    await page.goto(address);
    await page.evaluate(() => navigator.serviceWorker.ready);
    await expect.poll(counts).toEqual({ caches: 1, workers: 1 });

    root = killBuild;
    await page.reload();
    await expect.poll(counts, { timeout: 30_000 }).toEqual({ caches: 0, workers: 0 });

    // The kill build's own app must not register a worker again. Retried: the
    // kill switch reloads the tab itself, and that can collide with this reload.
    await expect(async () => {
      await page.reload();
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      expect(await counts()).toEqual({ caches: 0, workers: 0 });
    }).toPass({ timeout: 30_000 });
  } finally {
    server.close();
  }
});
