// Edge cases the fixtures do not cover.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse, sniff } from "../src/convert/csv.ts";
import { detect } from "../src/convert/detect.ts";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import * as XLSX from "xlsx";
import { convert } from "../src/convert/index.ts";
import { table } from "../src/convert/markdown.ts";
import { convertXlsx } from "../src/convert/xlsx.ts";

const bytes = (s: string) => new TextEncoder().encode(s);
const fixture = (name: string) => new Uint8Array(readFileSync(new URL(`./fixtures/${name}`, import.meta.url)));

describe("detect", () => {
  it("trusts the bytes when the extension lies", async () => {
    expect(await detect("rapport.docx", fixture("06-rapport-flera-sidor.pdf"))).toEqual({ format: "pdf" });
    expect(await detect("budget.docx", fixture("03-budget-forening.xlsx"))).toEqual({ format: "xlsx" });
    expect(await detect("utan-andelse", fixture("05-workshop-presentation.pptx"))).toEqual({ format: "pptx" });
  });

  it("names legacy formats and rejects the rest", async () => {
    expect(await detect("gammal.doc", bytes("\xd0\xcf\x11\xe0"))).toEqual({ format: null, legacy: "doc" });
    expect(await detect("bild.png", bytes("\x89PNG"))).toEqual({ format: null, legacy: undefined });
  });

  it("does not read a binary file named .csv as text", async () => {
    expect(await detect("export.csv", fixture("06-rapport-flera-sidor.pdf"))).toEqual({ format: "pdf" });
    expect(await detect("export.csv", fixture("03-budget-forening.xlsx"))).toEqual({ format: "xlsx" });
    expect(await detect("export.csv", new Uint8Array([0xd0, 0xcf, 0x11, 0xe0]))).toEqual({ format: null, locked: true });
    expect(await detect("export.csv", bytes("PK\x03\x04"))).toEqual({ format: null, legacy: undefined });
    expect(await detect("export.csv", bytes("namn;ort\nÅsa;Lerum\n"))).toEqual({ format: "csv" });
  });

  it("calls an OLE file named .docx locked, not unsupported", async () => {
    const ole = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
    expect(await detect("lönelista.xlsx", ole)).toEqual({ format: null, locked: true });
    const r = await convert({ name: "avtal.docx", data: ole.buffer });
    expect(r.warnings).toEqual([{ code: "unsupported_format", message: expect.stringContaining("lösenordsskyddad") }]);
  });
});

it("says 1 formel, not 1 formler", async () => {
  const ws: XLSX.WorkSheet = { "!ref": "A1:B1", A1: { t: "s", v: "Summa" }, B1: { t: "z", f: "SUM(C1:C9)" } };
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Blad1");
  const r = await convertXlsx(new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" })));
  expect(r.warnings[0].message).toMatch(/^1 formel saknar/);
});

it("shows Excel's built-in date and date-time formats the Swedish way", async () => {
  const when = 46024 + 9 / 24 + 5 / 1440; // 2026-01-02 09:05
  const ws: XLSX.WorkSheet = { "!ref": "A1:B1", A1: { t: "n", v: when, z: "m/d/yy" }, B1: { t: "n", v: when, z: "m/d/yy h:mm" } };
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Blad1");
  const { markdown } = await convertXlsx(new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" })));
  expect(markdown).toContain("| 2026-01-02 | 2026-01-02 09:05 |");
});

it("counts dates from 1904 in a workbook set to that date system", async () => {
  const ws: XLSX.WorkSheet = { "!ref": "A1:B1", A1: { t: "s", v: "Datum" }, B1: { t: "n", v: 46024, z: "yyyy-mm-dd" } };
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Blad1");
  wb.Workbook = { ...wb.Workbook, WBProps: { date1904: true } };
  const { markdown } = await convertXlsx(new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" })));
  expect(markdown).toContain("| Datum | 2030-01-03 |");
});

it("keeps a lone carriage return (old Mac CSV) inside its table row", () => {
  expect(table([["a"], ["rad ett\rrad två"]])).toBe("| a |\n| --- |\n| rad ett rad två |");
});

/** Runs convert() on a minimal Word file with this as its document body. */
function convertWordBody(body: string) {
  const files = zipSync({
    "[Content_Types].xml": strToU8('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'),
    "_rels/.rels": strToU8('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'),
    "word/document.xml": strToU8(`<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`),
  });
  return convert({ name: "t.docx", data: files.buffer as ArrayBuffer });
}

describe("docx hidden text", () => {
  const run = (text: string, props = "") => `<w:r><w:rPr>${props}</w:rPr><w:t xml:space="preserve">${text}</w:t></w:r>`;

  it("leaves out a run marked hidden and keeps the text around it", async () => {
    const { markdown } = await convertWordBody(`<w:p>${run("Synlig ")}${run("HEMLIG ", "<w:b/><w:vanish/>")}${run("text")}</w:p>`);
    expect(markdown).toBe("Synlig text");
  });

  it("keeps a run whose hidden setting is switched off", async () => {
    const { markdown } = await convertWordBody(`<w:p>${run("Kvar", '<w:vanish w:val="0"/>')}</w:p>`);
    expect(markdown).toBe("Kvar");
  });
});

describe("docx table merged downward", () => {
  // "^" starts a downward merge with the text after it, "v" continues one.
  const tc = (s: string) => {
    const merge = s[0] === "^" ? '<w:vMerge w:val="restart"/>' : s === "v" ? "<w:vMerge/>" : "";
    return `<w:tc><w:tcPr>${merge}</w:tcPr><w:p><w:r><w:t>${s === "v" ? "" : s.replace("^", "")}</w:t></w:r></w:p></w:tc>`;
  };
  const docx = (rows: string[][]) => convertWordBody(`<w:tbl>${rows.map((r) => `<w:tr>${r.map(tc).join("")}</w:tr>`).join("")}</w:tbl>`);

  it("keeps later cells in their columns when the first column is merged", async () => {
    const { markdown } = await docx([["Avdelning", "Namn", "Lön"], ["^Ekonomi", "Anna", "100"], ["v", "Bo", "200"]]);
    expect(markdown).toBe("| Avdelning | Namn | Lön |\n| --- | --- | --- |\n| Ekonomi | Anna | 100 |\n|  | Bo | 200 |");
  });

  it("keeps later cells in their columns when a middle column is merged over three rows", async () => {
    const { markdown } = await docx([["A", "B", "C"], ["a1", "^x", "c1"], ["a2", "v", "c2"], ["a3", "v", "c3"]]);
    expect(markdown).toBe("| A | B | C |\n| --- | --- | --- |\n| a1 | x | c1 |\n| a2 |  | c2 |\n| a3 |  | c3 |");
  });
});

describe("convert", () => {
  it("warns unsupported_format in Swedish", async () => {
    const r = await convert({ name: "gammal.xls", data: bytes("x").buffer });
    expect(r.warnings).toEqual([{ code: "unsupported_format", message: expect.stringContaining(".xlsx") }]);
  });

  it("warns large_file above 25 MB and still converts", async () => {
    const big = bytes(`a;b\n1;"${"x".repeat(26 * 1024 * 1024)}"\n`);
    const r = await convert({ name: "stor.csv", data: big.buffer });
    expect(r.warnings.map((w) => w.code)).toEqual(["large_file"]);
    expect(r.markdown.startsWith("| a | b |")).toBe(true);
  });

  it("reads UTF-8 csv without a fallback warning", async () => {
    const r = await convert({ name: "a.csv", data: bytes("Namn,Ort\nÅsa,Lerum\n").buffer });
    expect(r.warnings).toEqual([]);
    expect(r.markdown).toContain("| Åsa | Lerum |");
  });
});

describe("csv", () => {
  it("keeps quoted delimiters, quotes and line breaks in one field", () => {
    expect(parse('a,b\n"x, y","he said ""hi""\nagain"\n', ",")).toEqual([["a", "b"], ["x, y", 'he said "hi"\nagain']]);
  });

  it("sniffs comma, semicolon and tab", () => {
    expect(sniff("a,b,c\n1,2,3\n")).toBe(",");
    expect(sniff("a;b\n1,5;2,5\n")).toBe(";");
    expect(sniff("a\tb\n1\t2\n")).toBe("\t");
  });

  it("picks the semicolon for Swedish decimals without a header row", () => {
    expect(sniff("1,5;2,5;3,5\n4,5;5,5;6,5\n")).toBe(";");
  });

  it("keeps the comma when semicolons do not split the rows evenly", () => {
    expect(sniff("a;x,b,c\n1,2,3\n4,5,6\n")).toBe(",");
  });

  it("keeps a quote that never closes as text, and the rows after it", () => {
    expect(parse('"a;b";c\n"Anna;Lund\nBo;Malmö\n', ";")).toEqual([["a;b", "c"], ['"Anna', "Lund"], ["Bo", "Malmö"]]);
  });
});

describe("big inputs", () => {
  it("builds a table of 200 000 rows (a spread of that many arguments overflows the stack)", () => {
    const rows = Array.from({ length: 200_000 }, (_, i) => [String(i), "x"]);
    expect(table(rows).split("\n")).toHaveLength(200_001);
  });

  it("reads only the cells an xlsx sheet has, even when it claims the whole grid", async () => {
    // Written small, then the <dimension> tag is made to claim A1:XFD1048576, as some files do.
    const sheet = XLSX.utils.aoa_to_sheet([["Namn", "Ort"], ["Åsa", "Lerum"]]);
    const files = unzipSync(XLSX.write({ SheetNames: ["S"], Sheets: { S: sheet } }, { type: "buffer", bookType: "xlsx" }));
    const xml = strFromU8(files["xl/worksheets/sheet1.xml"]);
    files["xl/worksheets/sheet1.xml"] = strToU8(xml.replace(/<dimension ref="[^"]*"/, '<dimension ref="A1:XFD1048576"'));
    const { markdown } = await convertXlsx(zipSync(files));
    expect(markdown).toBe("## S\n\n| Namn | Ort |\n| --- | --- |\n| Åsa | Lerum |");
  });

  it("does not stretch an xlsx sheet to an empty formatted cell far away", async () => {
    const sheet = XLSX.utils.aoa_to_sheet([["Namn", "Ort"], ["Åsa", "Lerum"]]);
    const files = unzipSync(XLSX.write({ SheetNames: ["S"], Sheets: { S: sheet } }, { type: "buffer", bookType: "xlsx" }));
    const xml = strFromU8(files["xl/worksheets/sheet1.xml"]);
    files["xl/worksheets/sheet1.xml"] = strToU8(xml.replace("</sheetData>", '<row r="2000"><c r="XFD2000" s="0"/></row></sheetData>'));
    const start = Date.now();
    const { markdown } = await convertXlsx(zipSync(files));
    expect(markdown).toBe("## S\n\n| Namn | Ort |\n| --- | --- |\n| Åsa | Lerum |");
    expect(Date.now() - start).toBeLessThan(5000); // 32 million cells if the empty one counts
  });
});
