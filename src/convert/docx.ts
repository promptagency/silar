// Word (.docx) via mammoth (to HTML) and turndown (to Markdown). Mammoth
// leaves out headers and footers on its own; images are dropped unread.
import mammoth from "mammoth";
import TurndownService from "turndown";
import { cell } from "./markdown.ts";
import type { ConvertResult } from "./types.ts";

// Title becomes # and Heading n becomes n+1; promoteHeadings undoes the shift
// when the document has no Title, so its Heading 1 stays #.
const STYLE_MAP = [
  "p[style-name='Title'] => h1:fresh",
  ...[1, 2, 3, 4, 5].map((n) => `p[style-name='Heading ${n}'] => h${n + 1}:fresh`),
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
      const index = Array.prototype.indexOf.call(parent.children, node);
      const marker = parent.nodeName === "OL" ? `${Number(parent.getAttribute("start") ?? 1) + index}. ` : "- ";
      const body = content.trim().replace(/\n/g, `\n${" ".repeat(marker.length)}`);
      return `${marker}${body}${node.nextSibling ? "\n" : ""}`;
    },
  });
  // GFM tables. Mammoth writes <td> only, so the first row is the header.
  // A merged cell keeps its text in the first column and leaves the rest empty.
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
      const table = node.parentNode?.nodeName === "TABLE" ? node.parentNode : node.parentNode?.parentNode;
      const first = table && (table as HTMLElement).querySelector("tr") === node;
      if (!first) return row;
      const width = Array.from((node as HTMLElement).children).reduce((n, c) => n + Number(c.getAttribute("colspan") ?? 1), 0);
      return `${row}|${" --- |".repeat(width)}\n`;
    },
  });
  td.addRule("table", { filter: "table", replacement: (content) => `\n\n${content.trim()}\n\n` });
  td.addRule("tableSection", { filter: ["thead", "tbody", "tfoot"], replacement: (content) => content });
  return td;
}

export async function convertDocx(bytes: Uint8Array): Promise<ConvertResult> {
  // Node's mammoth reads `buffer`, the browser build `arrayBuffer`.
  const input = { buffer: bytes, arrayBuffer: bytes.buffer } as unknown as { arrayBuffer: ArrayBuffer };
  const { value } = await mammoth.convertToHtml(input, {
    styleMap: STYLE_MAP,
    convertImage: mammoth.images.imgElement(async () => ({ src: "" })),
  });
  return { markdown: turndown().turndown(promoteHeadings(value)), warnings: [], meta: { format: "docx" } };
}
