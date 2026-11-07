import { expect, it } from "vitest";
import { approxTokens, extent, markdownName, notices } from "../src/ui/text.ts";

it("groups scanned pages into one notice", () => {
  const w = (page: number) => ({ code: "page_without_text" as const, page, message: `Sida ${page} saknar text.` });
  expect(notices([w(2), w(5), w(7)])).toEqual([
    { code: "page_without_text", title: "Sidor utan text", message: "Sidorna 2, 5 och 7 saknar text, de är troligen inskannade. De finns inte med i resultatet." },
  ]);
  expect(notices([w(2)])[0].message).toBe("Sida 2 saknar text.");
});

it("describes the extent per format and names the download", () => {
  expect(extent({ format: "pdf", pages: 1 })).toBe("1 sida");
  expect(extent({ format: "pptx", pages: 12 })).toBe("12 bilder");
  expect(extent({ format: "xlsx", sheets: ["a", "b"] })).toBe("2 flikar");
  expect(extent({ format: "csv" })).toBeNull();
  expect(markdownName("Rapport 2026.final.pdf")).toBe("Rapport 2026.final.md");
  expect(approxTokens(3300)).toBe(1000);
});
