// PDF via pdf.js: text per page, running headers and footers removed,
// headings from font size, lines joined into paragraphs, also across page
// breaks. Pages without text but with an image are reported as scanned.
//
// pdf.js gets the bytes and nothing else: no font loading or fetching.
// In the browser the caller sets GlobalWorkerOptions (see docs/decisions/0001).
import type { ConvertResult, Warning } from "../types.ts";
import { removeFurniture } from "./furniture.ts";
import { bodySize, headingLevels } from "./headings.ts";
import { table } from "../markdown.ts";
import { type Cell, groupLines, type Item, joinText, type Line, median, readingOrder, tableRows } from "./layout.ts";

type PdfJs = typeof import("pdfjs-dist");

// Node needs pdf.js's legacy build. A variable specifier keeps Vite from
// bundling it into the browser build.
const LEGACY = "pdfjs-dist/legacy/build/pdf.mjs";
const inNode = !!(globalThis as { process?: { versions?: { node?: string } } }).process?.versions?.node && !("window" in globalThis) && !("WorkerGlobalScope" in globalThis);
const loadPdfJs = (): Promise<PdfJs> => (inNode ? import(/* @vite-ignore */ LEGACY) : import("pdfjs-dist"));

type Block =
  | { kind: "heading"; level: number; text: string }
  | { kind: "para"; text: string }
  | { kind: "table"; rows: Cell[][]; text: string[] }
  | { kind: "missing"; page: number };

const SENTENCE_END = /[.!?:;»”")\]]$/;

export async function convertPdf(bytes: Uint8Array): Promise<ConvertResult> {
  const pdfjs = await loadPdfJs();
  const images = new Set<number>([pdfjs.OPS.paintImageXObject, pdfjs.OPS.paintInlineImageXObject, pdfjs.OPS.paintImageMaskXObject, pdfjs.OPS.paintImageXObjectRepeat]);
  const task = pdfjs.getDocument({
    data: bytes,
    disableFontFace: true,
    useSystemFonts: false,
    disableAutoFetch: true,
    disableStream: true,
    useWasm: false,
    useWorkerFetch: false,
    verbosity: 0,
  });
  try {
    const doc = await task.promise;
    const pages: { lines: Line[]; height: number; scanned: boolean }[] = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const items: Item[] = [];
      for (const it of (await page.getTextContent()).items) {
        if (!("str" in it)) continue;
        const [a, b, , , x, y] = it.transform as number[];
        items.push({ str: it.str, x, y, width: it.width, size: Math.round(Math.hypot(a, b) * 2) / 2 });
      }
      const lines = readingOrder(items, page.getViewport({ scale: 1 }).width).flatMap(groupLines);
      // Only text-less pages are checked for images: that is what a scan looks like.
      const scanned = lines.length === 0 && (await page.getOperatorList()).fnArray.some((op) => images.has(op));
      pages.push({ lines, height: page.getViewport({ scale: 1 }).height, scanned });
      page.cleanup();
    }

    const meta = { format: "pdf", pages: doc.numPages };
    if (pages.every((p) => p.lines.length === 0)) {
      const message = "PDF:en saknar text, den är troligen inskannad. Silar läser inte text i bilder. Kör textigenkänning (OCR) på filen först.";
      return { markdown: "", warnings: [{ code: "no_text_layer", message }], meta };
    }

    const kept = removeFurniture(pages);
    const all = kept.flat();
    const body = bodySize(all);
    const levels = headingLevels(all, body);
    // Typical distance between two lines of one paragraph.
    const lineGap = median(kept.flatMap((lines) => lines.slice(1).map((l, i) => lines[i].y - l.y).filter((g, i) => g > 0 && lines[i + 1].size === body))) || body * 1.2;

    const blocks: Block[] = [];
    const warnings: Warning[] = [];
    kept.forEach((lines, i) => {
      if (pages[i].scanned) {
        warnings.push({ code: "page_without_text", page: i + 1, message: `Sida ${i + 1} saknar text, den är troligen inskannad. Den finns inte med i resultatet.` });
        blocks.push({ kind: "missing", page: i + 1 });
        return;
      }
      let prev: Line | null = null;
      for (const line of lines) {
        const level = levels.get(line.size);
        const last = blocks.at(-1);
        const drop = prev === null ? null : prev.y - line.y;
        // A new page, or a jump up to the next column: continue only an unfinished sentence.
        const fresh = drop === null || drop <= 0;
        const near = !fresh && drop! <= lineGap * 1.3;
        if (level) {
          if (last?.kind === "heading" && last.level === level && near) last.text = joinText(last.text, line.text);
          else blocks.push({ kind: "heading", level, text: line.text });
        } else if (line.cells) {
          if (last?.kind === "table" && prev?.cells && !fresh) {
            last.rows.push(line.cells);
            last.text.push(line.text);
          } else blocks.push({ kind: "table", rows: [line.cells], text: [line.text] });
        } else if (last?.kind === "para" && (fresh ? !SENTENCE_END.test(last.text) : near && !levels.has(prev!.size) && !prev!.cells)) {
          last.text = joinText(last.text, line.text);
        } else blocks.push({ kind: "para", text: line.text });
        prev = line;
      }
    });

    const markdown = blocks
      .map((b) => {
        if (b.kind === "heading") return `${"#".repeat(b.level)} ${b.text}`;
        if (b.kind === "para") return b.text;
        // A lone wide-spaced line is not a table.
        if (b.kind === "table") return b.rows.length > 1 ? table(tableRows(b.rows)) : b.text[0];
        return `<!-- Sida ${b.page} saknar text -->`;
      })
      .join("\n\n");
    return { markdown, warnings, meta };
  } finally {
    await task.destroy();
  }
}
