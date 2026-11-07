import { readdirSync } from "node:fs";
import { expect, test } from "@playwright/test";

const FIXTURES = new URL("../fixtures/", import.meta.url).pathname;
const DIST = new URL("../../dist/", import.meta.url).pathname;

// Playwright drives service workers reliably in Chromium only.
test.skip(({ browserName }) => browserName !== "chromium", "service worker test runs in Chromium");

test("the service worker caches only built files, never a document, and works offline", async ({ page, context }) => {
  await page.goto("/");
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload(); // now controlled, so the worker's fetches go through the cache
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);

  await page.locator('input[type="file"]').setInputFiles(FIXTURES + "01-protokoll-styrelsemote.docx");
  await expect(page.getByRole("heading", { name: "Silat." })).toBeVisible({ timeout: 30_000 });

  const cached: string[] = await page.evaluate(async () => {
    const out: string[] = [];
    for (const name of await caches.keys()) for (const req of await (await caches.open(name)).keys()) out.push(new URL(req.url).pathname);
    return out;
  });
  const built = new Set(readdirSync(DIST, { recursive: true }).map((f) => `/${String(f)}`));
  expect(cached.filter((p) => p !== "/__sw-manifest" && !built.has(p))).toEqual([]);
  expect(cached.some((p) => /\/docx-[\w-]+\.js$/.test(p))).toBe(true); // cached on first use
  expect(cached.some((p) => /\/pdf\.worker/.test(p))).toBe(false); // never opened, never fetched
  expect(cached.some((p) => p.includes("protokoll"))).toBe(false);

  await context.setOffline(true);
  await page.reload();
  await page.locator('input[type="file"]').setInputFiles(FIXTURES + "01-protokoll-styrelsemote.docx");
  await expect(page.getByLabel("Resultat i Markdown")).toContainText("| Medlemsavgifter | 120 000 | 118 500 |", { timeout: 30_000 });
});
