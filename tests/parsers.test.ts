// Phase 0 gate: every chosen parser imports and runs in Node on a real
// fixture, using the same dynamic import() the converters will use.
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url));

it("mammoth reads docx to HTML", async () => {
  const mammoth = await import("mammoth");
  const { value } = await mammoth.convertToHtml({ buffer: fixture("01-protokoll-styrelsemote.docx") });
  expect(value).toContain("Protokoll styrelsemöte");
});

it("turndown turns HTML into Markdown without a browser DOM", async () => {
  const { default: TurndownService } = await import("turndown");
  const md = new TurndownService({ headingStyle: "atx" }).turndown("<h1>Rubrik</h1><p><strong>fet</strong> å ä ö</p>");
  expect(md).toBe("# Rubrik\n\n**fet** å ä ö");
});

it("SheetJS reads xlsx sheets", async () => {
  const XLSX = await import("xlsx");
  const book = XLSX.read(fixture("03-budget-forening.xlsx"));
  expect(book.SheetNames).toEqual(expect.arrayContaining(["Budget 2027", "Kontaktlista"]));
});

it("fflate + fast-xml-parser read pptx slide list", async () => {
  const { unzipSync, strFromU8 } = await import("fflate");
  const { XMLParser } = await import("fast-xml-parser");
  const files = unzipSync(new Uint8Array(fixture("05-workshop-presentation.pptx")));
  const xml = new XMLParser({ ignoreAttributes: false }).parse(strFromU8(files["ppt/presentation.xml"]));
  expect(xml["p:presentation"]["p:sldIdLst"]["p:sldId"].length).toBeGreaterThan(1);
});

it("pdf.js legacy build extracts text in Node", async () => {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = pdfjs.getDocument({ data: new Uint8Array(fixture("06-rapport-flera-sidor.pdf")), verbosity: 0 });
  const doc = await task.promise;
  const page = await doc.getPage(1);
  const text = (await page.getTextContent()).items.map((i) => ("str" in i ? i.str : "")).join(" ");
  expect(doc.numPages).toBe(3);
  expect(text).toContain("Verksamhetsrapport 2026");
  await task.destroy(); // pdf.js 6: destroy lives on the loading task
});
