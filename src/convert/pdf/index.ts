// PDF via pdf.js: text per page, running headers and footers removed,
// headings from font size, lines joined into paragraphs, also across page
// breaks. Pages with an image and no or hardly any text are reported as scanned.
//
// pdf.js gets the bytes and nothing else: no font loading or fetching.
// In the browser the caller sets GlobalWorkerOptions (see docs/decisions/0001).
// The legacy build, in Node and browsers alike: the modern one needs features
// only recent browsers have (Promise.try: Chrome 128, Safari 18.2).
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import type { ConvertResult, Warning } from "../types.ts";
import { removeFurniture } from "./furniture.ts";
import { bodySize, headingLevels } from "./headings.ts";
import { table } from "../markdown.ts";
import { type Cell, groupLines, type Item, joinText, type Line, median, readingOrder, tableRows, turnSideways } from "./layout.ts";

type Block =
  | { kind: "heading"; level: number; text: string }
  | { kind: "para"; text: string }
  | { kind: "table"; rows: Cell[][]; text: string[] }
  | { kind: "missing"; page: number };

const SENTENCE_END = /[.!?:;»”")\]]$/;

// Image ops carry [id, width, height] or [{ width, height, ... }].
const imageWidth = ([first, width]: any[]): number => (typeof first === "string" ? width : first.width);

export async function convertPdf(bytes: Uint8Array): Promise<ConvertResult> {
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
      const drawn: (Item & { a: number; b: number })[] = [];
      for (const it of (await page.getTextContent()).items) {
        if (!("str" in it)) continue;
        const [a, b, , , x, y] = it.transform as number[];
        drawn.push({ str: it.str, x, y, width: it.width, size: Math.round(Math.hypot(a, b) * 2) / 2, a, b });
      }
      // Text positions are in the page's own box, which /Rotate does not change.
      const viewport = page.getViewport({ scale: 1 });
      const { items, width, height } = turnSideways(drawn, page.view[2], page.view[3]) ?? { items: drawn, width: viewport.width, height: viewport.height };
      const lines = readingOrder(items, width).flatMap(groupLines);
      // A scan has no text, or only a stamp or page number on top of a page-wide image. A cover logo beside a short title is not one.
      const chars = lines.reduce((n, l) => n + l.text.length, 0);
      const ops = chars < 40 ? await page.getOperatorList() : null;
      const scanned = !!ops && ops.fnArray.some((op, i) => images.has(op) && (chars === 0 || imageWidth(ops.argsArray[i]) >= 1000));
      pages.push({ lines, height, scanned });
      page.cleanup();
    }

    const meta = { format: "pdf", pages: doc.numPages };
    if (pages.every((p) => p.scanned || p.lines.length === 0)) {
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
        // Pushed as they are, so a stamp never joins the text of the page before or after.
        for (const line of lines) blocks.push({ kind: "para", text: line.text });
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
