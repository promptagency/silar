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
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Silar fram texten. Resten stannar kvar.");
  expect(foreign).toEqual([]);
});

const CASES: [string, string][] = [
  ["01-protokoll-styrelsemote.docx", "| Medlemsavgifter | 120 000 | 118 500 |"],
  ["03-budget-forening.xlsx", "## Kontaktlista"],
  ["04-export-svensk-excel.csv", "| Flytväst barn | 12 | 449,50 |"],
  ["05-workshop-presentation.pptx", "### Talaranteckningar"],
  ["06-rapport-flera-sidor.pdf", "## Handläggning"],
];

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
