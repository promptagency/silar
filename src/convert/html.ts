// Shared by docx and html: the turndown setup (GFM tables, list numbering) and the DOM passes it relies on.
import { createDocument } from "@mixmark-io/domino";
import TurndownService from "turndown";
import { cell } from "./markdown.ts";
import { CONTROL, decode, ENCODING_WARNING, isBinary } from "./text.ts";
import type { ConvertResult } from "./types.ts";

export function turndown(): TurndownService {
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

/**
 * Mammoth writes a downward merge as rowspan and leaves out the cells it
 * covers. They are put back empty, so later cells stay in their columns.
 */
export function fillMergedCells(doc: Document): void {
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
export function markPositions(doc: Document): void {
  for (const list of Array.from(doc.body.querySelectorAll("ol, ul"))) {
    let i = 0;
    for (const li of Array.from(list.children)) if (li.nodeName === "LI") li.setAttribute("data-index", String(i++));
  }
  for (const table of Array.from(doc.body.querySelectorAll("table"))) {
    const first = Array.from(table.querySelectorAll("tr")).find((tr) => tr.closest("table") === table);
    first?.setAttribute("data-first-row", "");
  }
}

// Nothing here is run or fetched: domino parses only, and these are dropped unread.
const DROPPED = "script, style, noscript, template, iframe, object, svg, img, input, select, textarea, button";

export async function convertHtml(bytes: Uint8Array): Promise<ConvertResult> {
  const { text, fallback } = decode(bytes);
  if (isBinary(text))
    return { markdown: "", warnings: [{ code: "corrupt_file", message: "Filen ser inte ut som en webbsida utan innehåller binära data. Kontrollera att det är rätt fil och försök igen." }], meta: { format: "html" } };
  // shortcut: a <meta charset> other than UTF-8 is not honoured, only the bytes decide; add it if real pages show mojibake.
  const doc = createDocument(text.replace(CONTROL, ""));
  const title = doc.querySelector("title")?.textContent?.trim();
  for (const el of Array.from(doc.body.querySelectorAll(DROPPED))) el.remove();
  fillMergedCells(doc);
  markPositions(doc);
  const body = turndown().turndown(doc.body).replace(/\n{3,}/g, "\n\n").trim();
  const markdown = title && !doc.body.querySelector("h1") ? `# ${title}\n\n${body}`.trim() : body;
  return { markdown, warnings: fallback ? [ENCODING_WARNING] : [], meta: { format: "html" } };
}
