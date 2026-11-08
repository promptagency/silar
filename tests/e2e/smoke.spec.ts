import { readFileSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";

const FIXTURES = new URL("../fixtures/", import.meta.url).pathname;

/** Collects every request that is not to the page's own origin. */
function watchForeign(page: Page, origin: string): string[] {
  const foreign: string[] = [];
  page.on("request", (req) => {
    const url = new URL(req.url());
    if (!["data:", "blob:"].includes(url.protocol) && url.origin !== origin) foreign.push(req.url());
  });
  return foreign;
}

test("start page loads and talks only to its own origin", async ({ page, baseURL }) => {
  const foreign = watchForeign(page, new URL(baseURL!).origin);
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Sila fram texten. Spara dina tokens.");
  expect(foreign).toEqual([]);
});

const CASES: [string, string][] = [
  ["01-protokoll-styrelsemote.docx", "| Medlemsavgifter | 120 000 | 118 500 |"],
  ["03-budget-forening.xlsx", "## Kontaktlista"],
  ["04-export-svensk-excel.csv", "| Flytväst barn | 12 | 449,50 |"],
  ["05-workshop-presentation.pptx", "### Talaranteckningar"],
  ["06-rapport-flera-sidor.pdf", "## Handläggning"],
];

// Only Chromium lets a test grant clipboard read access.
test("Kopiera puts the whole result on the clipboard", async ({ page, context, browserName }) => {
  test.skip(browserName !== "chromium", "clipboard permissions are Chromium only");
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/");
  await page.locator('input[type="file"]').setInputFiles(FIXTURES + "01-protokoll-styrelsemote.docx");
  const result = page.getByLabel("Resultat i Markdown");
  await expect(result).toContainText("Medlemsavgifter", { timeout: 30_000 });
  await page.getByRole("button", { name: "Kopiera" }).click();
  await expect(page.getByRole("button", { name: "Kopierat." })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(await result.textContent());
});

for (const [file, expected] of CASES) {
  test(`converts ${file} in the browser, same origin only`, async ({ page, baseURL }) => {
    const foreign = watchForeign(page, new URL(baseURL!).origin);
    await page.goto("/");
    await page.locator('input[type="file"]').setInputFiles(FIXTURES + file);
    await expect(page.getByRole("heading", { name: "Silat." })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByLabel("Resultat i Markdown")).toContainText(expected);
    expect(foreign).toEqual([]);
  });
}

test("a scanned PDF shows the warning instead of a result", async ({ page }) => {
  await page.goto("/");
  await page.locator('input[type="file"]').setInputFiles(FIXTURES + "09-pdf-skannad.pdf");
  await expect(page.getByRole("heading", { name: "Ingen text att sila" })).toBeVisible({ timeout: 30_000 });
});

test("a mixed PDF shows the page warning above the result", async ({ page }) => {
  await page.goto("/");
  await page.locator('input[type="file"]').setInputFiles(FIXTURES + "10-pdf-blandad.pdf");
  await expect(page.getByRole("note").getByText("Sida 2 saknar text")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByLabel("Resultat i Markdown")).toContainText("<!-- Sida 2 saknar text -->");
});

for (const how of ["Avbryt", "Esc"] as const)
test(`${how} stops a conversion and returns to the start`, async ({ page, context }) => {
  // Hold back the Word reader so the conversion is still running when Avbryt is pressed.
  await context.route(/\/assets\/docx-[\w-]+\.js$/, async (route) => {
    await new Promise((r) => setTimeout(r, 3000));
    await route.continue().catch(() => {});
  });
  await page.goto("/");
  await page.locator('input[type="file"]').setInputFiles(FIXTURES + "01-protokoll-styrelsemote.docx");
  const cancel = page.getByRole("button", { name: "Avbryt" });
  await expect(cancel).toBeVisible();
  await expect(cancel).toBeFocused();
  if (how === "Avbryt") await cancel.click();
  else await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: /^Välj (fil|dokument)$/ })).toBeFocused();
  await page.waitForTimeout(3500);
  await expect(page.getByRole("heading", { name: "Silat." })).toHaveCount(0);
});

test("a file dropped anywhere on the page converts, also a second time", async ({ page }) => {
  const csv = readFileSync(FIXTURES + "04-export-svensk-excel.csv");
  const drop = () =>
    page.evaluate(async (bytes) => {
      const dt = new DataTransfer();
      dt.items.add(new File([new Uint8Array(bytes)], "export.csv"));
      for (const type of ["dragenter", "dragover", "drop"]) document.body.dispatchEvent(new DragEvent(type, { dataTransfer: dt, bubbles: true }));
    }, [...csv]);
  await page.goto("/");
  // React may render after the load event; the drop listener is attached once the app is up.
  await expect(page.getByRole("button", { name: /^Välj (fil|dokument)$/ })).toBeVisible();
  await drop();
  await expect(page.getByLabel("Resultat i Markdown")).toContainText("| Flytväst barn | 12 | 449,50 |");
  await page.getByRole("button", { name: "Sila en till" }).first().click();
  await drop();
  await expect(page.getByLabel("Resultat i Markdown")).toContainText("| Flytväst barn | 12 | 449,50 |");
});
