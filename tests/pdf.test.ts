import { describe, expect, it } from "vitest";
import { removeFurniture } from "../src/convert/pdf/furniture.ts";
import { bodySize, headingLevels } from "../src/convert/pdf/headings.ts";
import { groupLines, joinText, type Line } from "../src/convert/pdf/layout.ts";

const line = (text: string, y: number, size = 10): Line => ({ text, x: 50, y, size });
const H = 842;

describe("groupLines", () => {
  it("puts pieces on one baseline in x order, with a space only at a real gap", () => {
    const lines = groupLines([
      { str: "värld", x: 80, y: 700, width: 25, size: 10 },
      { str: "Hej", x: 50, y: 700.5, width: 15, size: 10 },
      { str: "!", x: 105, y: 700, width: 3, size: 10 },
      { str: "Nästa", x: 50, y: 686, width: 25, size: 10 },
    ]);
    expect(lines.map((l) => l.text)).toEqual(["Hej värld!", "Nästa"]);
  });
});

describe("joinText", () => {
  it("undoes end-of-line hyphenation before a lower-case letter only", () => {
    expect(joinText("handläggnings-", "tiden")).toBe("handläggningstiden");
    expect(joinText("Region-", "Skåne")).toBe("Region- Skåne");
    expect(joinText("slut.", "Nästa")).toBe("slut. Nästa");
  });
});

describe("removeFurniture", () => {
  const page = (n: number) => ({
    height: H,
    lines: [line("Rapport 2026 · Kommunen", 810, 8), line(`Unik brödtext ${n}`, 700), line(`Sida ${n} av 3`, 30, 8)],
  });

  it("drops headers and page numbers that repeat across pages", () => {
    expect(removeFurniture([page(1), page(2), page(3)]).map((p) => p.map((l) => l.text))).toEqual([
      ["Unik brödtext 1"],
      ["Unik brödtext 2"],
      ["Unik brödtext 3"],
    ]);
  });

  it("keeps everything in a single-page document", () => {
    expect(removeFurniture([page(1)])[0]).toHaveLength(3);
  });

  it("keeps band lines that appear on only one page", () => {
    const pages = [page(1), page(2), { height: H, lines: [line("Bilaga", 815), line("Text", 700)] }];
    expect(removeFurniture(pages)[2].map((l) => l.text)).toEqual(["Bilaga", "Text"]);
  });
});

describe("headings", () => {
  it("takes body size from most characters and ranks larger sizes", () => {
    const lines = [line("Titel", 800, 18), line("Avsnitt", 760, 13), line("lång brödtext ".repeat(10), 740), line("mer brödtext ".repeat(10), 726)];
    const body = bodySize(lines);
    expect(body).toBe(10);
    expect([...headingLevels(lines, body)]).toEqual([
      [18, 1],
      [13, 2],
    ]);
  });
});
