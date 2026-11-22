// Word (.docx) via mammoth (to HTML) and turndown (to Markdown). Mammoth
// leaves out headers and footers on its own; images are dropped unread.
// Hidden text is left out, as hidden sheets and slides are in xlsx and pptx.
import { createDocument } from "@mixmark-io/domino";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import mammoth from "mammoth";
import { fillMergedCells, markPositions, turndown } from "./html.ts";
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

// A run with <w:vanish/> in its properties and only text after them. Anything
// else in the run (a drawing can nest runs) makes this not match, so the XML
// can never be cut in the wrong place.
// shortcut: text hidden through a character style, or in a run that holds more than text, stays in; widen this if real files show it.
const HIDDEN_RUN = /<w:r(?:\s[^>]*)?>\s*<w:rPr>(?:(?!<\/w:rPr>)[\s\S])*?<w:vanish(?:\s+w:val="(?:1|true|on)")?\s*\/>(?:(?!<\/w:rPr>)[\s\S])*?<\/w:rPr>(?:<w:t(?:\s[^>]*)?>[^<]*<\/w:t>|<w:tab\s*\/>|<w:br(?:\s[^>]*)?\/>)*<\/w:r>/g;
const TEXT_PARTS = ["word/document.xml", "word/footnotes.xml", "word/endnotes.xml"];

/** Mammoth has no setting for hidden text, so it is cut from the XML first. A file without any is returned as it came. */
function withoutHiddenText(bytes: Uint8Array): Uint8Array {
  // Only the text parts are inflated to look; images are unpacked only if the file must be rebuilt.
  const parts = unzipSync(bytes, { filter: (f) => TEXT_PARTS.includes(f.name) });
  const changed: Record<string, Uint8Array> = {};
  for (const [name, data] of Object.entries(parts)) {
    const xml = strFromU8(data);
    const visible = xml.replace(HIDDEN_RUN, "");
    if (visible !== xml) changed[name] = strToU8(visible);
  }
  if (Object.keys(changed).length === 0) return bytes;
  return zipSync({ ...unzipSync(bytes), ...changed }, { level: 0 });
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
