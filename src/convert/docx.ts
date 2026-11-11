// Word (.docx) via mammoth (to HTML) and turndown (to Markdown). Mammoth
// leaves out headers and footers on its own; images are dropped unread.
// Hidden text is left out, as hidden sheets and slides are in xlsx and pptx.
import { createDocument } from "@mixmark-io/domino";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import mammoth from "mammoth";
import TurndownService from "turndown";
import { cell } from "./markdown.ts";
import type { ConvertResult } from "./types.ts";

// Title becomes # and Heading n becomes n+1; promoteHeadings undoes the shift
// when the document has no Title, so its Heading 1 stays #.
// Mammoth nests lists by numbering level (w:ilvl) only. Word's "List Bullet 2"
// and "List Number 2" styles carry their level in the style instead, so they
// are nested here under the item before them.
const nested = (level: number, list: "ul" | "ol") => `${"ul|ol > li > ".repeat(level - 1)}${list} > li:fresh`;
const STYLE_MAP = [
  "p[style-name='Title'] => h1:fresh",
  ...[1, 2, 3, 4, 5].map((n) => `p[style-name='Heading ${n}'] => h${n + 1}:fresh`),
  ...[2, 3, 4, 5].flatMap((n) => [`p[style-name='List Bullet ${n}'] => ${nested(n, "ul")}`, `p[style-name='List Number ${n}'] => ${nested(n, "ol")}`]),
];

function promoteHeadings(html: string): string {
  return html.includes("<h1>") ? html : html.replace(/<(\/?)h([2-6])>/g, (_, slash, n) => `<${slash}h${Number(n) - 1}>`);
}

function turndown(): TurndownService {
  const td = new TurndownService({ headingStyle: "atx", bulletListMarker: "-", emDelimiter: "*", codeBlockStyle: "fenced" });
  // Text is for an AI chat, not a renderer: backslash escapes are noise.
  td.escape = (s) => s;
  td.remove(["img", "style", "script"]);
  td.addRule("listItem", {
    filter: "li",
    replacement(content, node) {
      const parent = node.parentNode as HTMLElement;
      // The position comes from markPositions: counting siblings here is quadratic on long lists.
      const index = Number((node as HTMLElement).getAttribute("data-index") ?? 0);
      const marker = parent.nodeName === "OL" ? `${Number(parent.getAttribute("start") ?? 1) + index}. ` : "- ";
      const body = content.trim().replace(/\n/g, `\n${" ".repeat(marker.length)}`);
      return `${marker}${body}${node.nextSibling ? "\n" : ""}`;
    },
  });
  // GFM tables. Mammoth writes <td> only, so the first row is the header.
  // A cell merged sideways keeps its text in the first column and leaves the
  // rest empty; downward merges are filled in by fillMergedCells.
  td.addRule("tableCell", {
    filter: ["td", "th"],
    replacement(content, node) {
      const span = Number((node as HTMLElement).getAttribute("colspan") ?? 1);
      return ` ${cell(content.replace(/\n+/g, " "))} |${" |".repeat(Math.max(0, span - 1))}`;
    },
  });
  td.addRule("tableRow", {
    filter: "tr",
    replacement(content, node) {
      const row = `|${content}\n`;
      // Marked by markPositions; a querySelector per row is quadratic on long tables.
      if (!(node as HTMLElement).hasAttribute("data-first-row")) return row;
      const width = Array.from((node as HTMLElement).children).reduce((n, c) => n + Number(c.getAttribute("colspan") ?? 1), 0);
      return `${row}|${" --- |".repeat(width)}\n`;
    },
  });
  td.addRule("table", { filter: "table", replacement: (content) => `\n\n${content.trim()}\n\n` });
  td.addRule("tableSection", { filter: ["thead", "tbody", "tfoot"], replacement: (content) => content });
  return td;
}

// A run with <w:vanish/> in its properties and only text after them. Anything
// else in the run (a drawing can nest runs) makes this not match, so the XML
// can never be cut in the wrong place.
// shortcut: text hidden through a character style, or in a run that holds more than text, stays in; widen this if real files show it.
const HIDDEN_RUN = /<w:r(?:\s[^>]*)?>\s*<w:rPr>(?:(?!<\/w:rPr>)[\s\S])*?<w:vanish(?:\s+w:val="(?:1|true|on)")?\s*\/>(?:(?!<\/w:rPr>)[\s\S])*?<\/w:rPr>(?:<w:t(?:\s[^>]*)?>[^<]*<\/w:t>|<w:tab\s*\/>|<w:br(?:\s[^>]*)?\/>)*<\/w:r>/g;
const TEXT_PARTS = ["word/document.xml", "word/footnotes.xml", "word/endnotes.xml"];

/** Mammoth has no setting for hidden text, so it is cut from the XML first. A file without any is returned as it came. */
function withoutHiddenText(bytes: Uint8Array): Uint8Array {
  const files = unzipSync(bytes);
  let found = false;
  for (const name of TEXT_PARTS) {
    if (!files[name]) continue;
    const xml = strFromU8(files[name]);
    const visible = xml.replace(HIDDEN_RUN, "");
    if (visible === xml) continue;
    files[name] = strToU8(visible);
    found = true;
  }
  return found ? zipSync(files, { level: 0 }) : bytes;
}

/**
 * Mammoth writes a downward merge as rowspan and leaves out the cells it
 * covers. They are put back empty, so later cells stay in their columns.
 */
function fillMergedCells(doc: Document): void {
  for (const table of Array.from(doc.body.querySelectorAll("table"))) {
    const covered: number[] = []; // per column, how many more rows a merge above reaches
    for (const tr of Array.from(table.querySelectorAll("tr"))) {
      if (tr.closest("table") !== table) continue; // a row of a table nested in this one
      let cell = tr.firstElementChild;
      for (let col = 0; cell || col < covered.length; col++) {
        if (!cell || covered[col] > 0) {
          tr.insertBefore(doc.createElement("td"), cell);
          if (covered[col] > 0) covered[col]--;
        } else {
          const span = Number(cell.getAttribute("colspan") ?? 1);
          for (let c = col; c < col + span; c++) covered[c] = Number(cell.getAttribute("rowspan") ?? 1) - 1;
          col += span - 1;
          cell = cell.nextElementSibling;
        }
      }
    }
  }
}

/** Marks each list item's position and each table's first row in one pass, for the turndown rules. */
function markPositions(doc: Document): void {
  for (const list of Array.from(doc.body.querySelectorAll("ol, ul"))) {
    let i = 0;
    for (const li of Array.from(list.children)) if (li.nodeName === "LI") li.setAttribute("data-index", String(i++));
  }
  for (const table of Array.from(doc.body.querySelectorAll("table"))) {
    const first = Array.from(table.querySelectorAll("tr")).find((tr) => tr.closest("table") === table);
    first?.setAttribute("data-first-row", "");
  }
}

export async function convertDocx(bytes: Uint8Array): Promise<ConvertResult> {
  const visible = withoutHiddenText(bytes);
  // Node's mammoth reads `buffer`, the browser build `arrayBuffer`.
  const input = { buffer: visible, arrayBuffer: visible.buffer } as unknown as { arrayBuffer: ArrayBuffer };
  const { value } = await mammoth.convertToHtml(input, {
    styleMap: STYLE_MAP,
    convertImage: mammoth.images.imgElement(async () => ({ src: "" })),
  });
  // Parsed with domino, not turndown's DOMParser: a Web Worker has no DOMParser.
  const doc = createDocument(promoteHeadings(value));
  fillMergedCells(doc);
  markPositions(doc);
  return { markdown: turndown().turndown(doc.body), warnings: [], meta: { format: "docx" } };
}
