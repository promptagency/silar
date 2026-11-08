import { describe, expect, it } from "vitest";
import { convert } from "../src/convert/index.ts";
import { removeFurniture } from "../src/convert/pdf/furniture.ts";
import { bodySize, headingLevels } from "../src/convert/pdf/headings.ts";
import { groupLines, type Item, joinText, type Line, readingOrder, tableRows } from "../src/convert/pdf/layout.ts";

const line = (text: string, y: number, size = 10): Line => ({ text, x: 50, y, size });
const H = 842;

describe("a page drawn sideways", () => {
  /** A one-page PDF with these pieces of text, each [matrix, x, y, text]. */
  function pdf(pieces: [string, number, number, string][], pageExtra = ""): ArrayBuffer {
    const stream = `BT /F1 12 Tf\n${pieces.map(([m, x, y, s]) => `${m} ${x} ${y} Tm (${s}) Tj`).join("\n")}\nET`;
    const objects = [
      "<< /Type /Catalog /Pages 2 0 R >>",
      "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] ${pageExtra} /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>`,
      `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ];
    const body = `%PDF-1.4\n${objects.map((o, i) => `${i + 1} 0 obj\n${o}\nendobj`).join("\n")}\ntrailer\n<< /Size 6 /Root 1 0 R >>`;
    return new TextEncoder().encode(body).buffer as ArrayBuffer;
  }
  const expected = "| Namn | Stad |\n| --- | --- |\n| Anna | Lund |\n| Bo | Umea |";
  const rows = [["Namn", "Stad"], ["Anna", "Lund"], ["Bo", "Umea"]];

  it("reads text running up the page as rows, also with /Rotate 90", async () => {
    const pieces = rows.flatMap(([a, b], r): [string, number, number, string][] => [["0 1 -1 0", 100 + r * 20, 100, a], ["0 1 -1 0", 100 + r * 20, 300, b]]);
    expect((await convert({ name: "s.pdf", data: pdf(pieces, "/Rotate 90") })).markdown).toBe(expected);
  });

  it("reads text running down the page as rows", async () => {
    const pieces = rows.flatMap(([a, b], r): [string, number, number, string][] => [["0 -1 1 0", 500 - r * 20, 700, a], ["0 -1 1 0", 500 - r * 20, 500, b]]);
    expect((await convert({ name: "s.pdf", data: pdf(pieces) })).markdown).toBe(expected);
  });
});

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

const item = (str: string, x: number, y: number, width: number, size = 10): Item => ({ str, x, y, width, size });

describe("readingOrder", () => {
  const W = 595;
  const prose = (y: number) => [item(`vänster ${y}`, 60, y, 200), item(`höger ${y}`, 315, y, 200)];

  it("reads the left column before the right one, under a full-width title", () => {
    const items = [item("Titel över båda spalterna", 60, 760, 400, 18), ...[700, 686, 672, 658, 644].flatMap(prose)];
    const order = readingOrder(items, W).flatMap(groupLines).map((l) => l.text);
    expect(order).toEqual(["Titel över båda spalterna", ...[700, 686, 672, 658, 644].map((y) => `vänster ${y}`), ...[700, 686, 672, 658, 644].map((y) => `höger ${y}`)]);
  });

  it("leaves table rows and single-column pages alone", () => {
    const rowsOf = (y: number) => [item("Skola", 70, y, 60, 9), item("412", 197, y, 17, 9), item("91 %", 268, y, 23, 9), item("Kommentar", 367, y, 53, 9)];
    const items = [700, 683, 666, 649, 632].flatMap(rowsOf);
    expect(readingOrder(items, W)).toEqual([items]);
  });
});

describe("tableRows", () => {
  it("puts cells under shared column starts and leaves gaps empty", () => {
    expect(
      tableRows([
        [{ x: 70, text: "Skola" }, { x: 197, text: "Elever" }, { x: 367, text: "Kommentar" }],
        [{ x: 70, text: "Hulan" }, { x: 198, text: "287" }],
        [{ x: 71, text: "Floda" }, { x: 197, text: "530" }, { x: 368, text: "Ny rektor" }],
      ]),
    ).toEqual([
      ["Skola", "Elever", "Kommentar"],
      ["Hulan", "287", ""],
      ["Floda", "530", "Ny rektor"],
    ]);
  });
});
