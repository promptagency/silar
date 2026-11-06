// Edge cases the fixtures do not cover.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse, sniff } from "../src/convert/csv.ts";
import { detect } from "../src/convert/detect.ts";
import { convert } from "../src/convert/index.ts";

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
});
