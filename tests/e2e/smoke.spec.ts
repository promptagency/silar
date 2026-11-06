import { expect, test } from "@playwright/test";

// shortcut: page load only; Phase 6 adds one conversion per format.
test("start page loads and talks only to its own origin", async ({ page, baseURL }) => {
  const foreign: string[] = [];
  page.on("request", (req) => {
    const url = new URL(req.url());
    if (url.protocol !== "data:" && url.origin !== new URL(baseURL!).origin) foreign.push(req.url());
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Silar fram texten. Resten stannar kvar.");
  expect(foreign).toEqual([]);
});
