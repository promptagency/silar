// OpenDocument text (.odt) and presentations (.odp), the LibreOffice formats,
// via fflate + fast-xml-parser. Only content.xml is read. Headings, paragraphs,
// nested lists and tables as for Word; slides as for PowerPoint. Comments,
// tracked changes, images and hidden text, paragraphs, sections and slides are left out.
import { XMLParser } from "fast-xml-parser";
import { strFromU8, unzipSync } from "fflate";
import { table } from "./markdown.ts";
import type { ConvertResult } from "./types.ts";

type Node = Record<string, unknown>;

const parser = new XMLParser({
  preserveOrder: true,
  ignoreAttributes: false,
  attributeNamePrefix: "",
  trimValues: false,
  parseTagValue: false,
  parseAttributeValue: false,
  htmlEntities: true,
});

const tag = (n: Node) => Object.keys(n).find((k) => k !== ":@") ?? "";
const kids = (n: Node): Node[] => (Array.isArray(n[tag(n)]) ? (n[tag(n)] as Node[]) : []);
const attr = (n: Node, name: string) => (n[":@"] as Record<string, string> | undefined)?.[name];
const child = (n: Node | undefined, name: string) => (n ? kids(n).find((k) => tag(k) === name) : undefined);
const all = (n: Node | undefined, name: string) => (n ? kids(n).filter((k) => tag(k) === name) : []);

// Not part of the text: comments, tracked changes, images and text boxes in the flow, footnote numbers.
const SKIP = new Set(["office:annotation", "office:annotation-end", "text:tracked-changes", "text:note-citation", "draw:frame", "text:sequence-decls"]);
// Slide parts that are not content.
const SKIPPED_CLASSES = new Set(["page-number", "footer", "date-time", "header"]);
// A repeat count is a size claim from the file: cap it so a huge one cannot blow up memory.
const MAX_REPEAT = 20;
const repeat = (n: Node, name: string) => Math.min(Math.max(Number(attr(n, name)) || 1, 1), MAX_REPEAT);

/** Numbered list levels per list style (automatic styles in content.xml). */
type Lists = Map<string, Set<number>>;

// shortcut: footnote text stays inline where the note sits; move it to the end if that reads badly.
function inline(n: Node): string {
  const t = tag(n);
  if (t === "#text") return String(n["#text"]);
  if (t === "text:s") return " ".repeat(Math.min(Number(attr(n, "text:c")) || 1, 100));
  if (t === "text:tab" || t === "text:line-break") return " ";
  if (t === "text:note") return ` ${kids(n).map(inline).join("")} `;
  if (SKIP.has(t) || (t === "text:hidden-text" && attr(n, "text:is-hidden") === "true")) return "";
  return kids(n).map(inline).join("");
}

const clean = (s: string) => s.replace(/\s+/g, " ").trim();
const hiddenPara = (p: Node) => all(p, "text:hidden-paragraph").some((h) => attr(h, "text:is-hidden") === "true");

/** Text of every paragraph and heading below the nodes, in order. */
function paras(nodes: Node[]): string[] {
  return nodes.flatMap((n) => {
    const t = tag(n);
    if (t === "text:p" || t === "text:h") return hiddenPara(n) ? [] : [clean(inline(n))].filter(Boolean);
    return SKIP.has(t) ? [] : paras(kids(n));
  });
}

// shortcut: only list styles in content.xml are read, so numbering set in styles.xml comes out as "-".
function list(n: Node, depth: number, indent: string, style: string | undefined, lists: Lists, out: string[]): void {
  style = attr(n, "text:style-name") ?? style;
  const numbered = !!style && !!lists.get(style)?.has(depth + 1);
  let count = 0;
  for (const item of all(n, "text:list-item")) {
    const text = paras(kids(item).filter((k) => tag(k) !== "text:list")).join(" ");
    const marker = numbered ? `${++count}. ` : "- ";
    if (text) out.push(`${indent}${marker}${text}`);
    for (const sub of all(item, "text:list")) list(sub, depth + 1, indent + " ".repeat(marker.length), style, lists, out);
  }
}

function tableOf(n: Node): string {
  const rows: string[][] = [];
  const walk = (nodes: Node[]) => {
    for (const r of nodes) {
      if (tag(r) !== "table:table-row") {
        if (["table:table-header-rows", "table:table-rows", "table:table-row-group"].includes(tag(r))) walk(kids(r));
        continue;
      }
      const cells = kids(r)
        .filter((c) => tag(c) === "table:table-cell" || tag(c) === "table:covered-table-cell")
        .flatMap((c) => Array<string>(repeat(c, "table:number-columns-repeated")).fill(paras(kids(c)).join(" ")));
      while (cells.length && !cells.at(-1)) cells.pop();
      if (cells.length) for (let i = repeat(r, "table:number-rows-repeated"); i > 0; i--) rows.push(cells);
    }
  };
  walk(kids(n));
  return table(rows);
}

/** Block-level content in document order, as Markdown blocks. */
function blocks(nodes: Node[], lists: Lists, out: string[]): void {
  for (const n of nodes) {
    const t = tag(n);
    if (t === "text:h" || t === "text:p") {
      const text = hiddenPara(n) ? "" : clean(inline(n));
      if (!text) continue;
      const level = Math.min(Math.max(Number(attr(n, "text:outline-level")) || 1, 1), 6);
      out.push(t === "text:h" ? `${"#".repeat(level)} ${text}` : text);
    } else if (t === "text:list") {
      const lines: string[] = [];
      list(n, 0, "", undefined, lists, lines);
      if (lines.length) out.push(lines.join("\n"));
    } else if (t === "table:table") {
      const md = tableOf(n);
      if (md) out.push(md);
    } else if ((t === "text:section" && attr(n, "text:display") !== "none") || t === "draw:text-box") blocks(kids(n), lists, out);
  }
}

function open(bytes: Uint8Array) {
  const files = unzipSync(bytes, { filter: (f) => f.name === "content.xml" });
  if (!files["content.xml"]) throw new Error("no content.xml");
  const root = (parser.parse(strFromU8(files["content.xml"])) as Node[]).find((n) => tag(n) === "office:document-content") ?? {};
  const styles = child(root, "office:automatic-styles");
  const lists: Lists = new Map(all(styles, "text:list-style").map((s) => [attr(s, "style:name") ?? "", new Set(all(s, "text:list-level-style-number").map((l) => Number(attr(l, "text:level"))))]));
  return { body: child(root, "office:body"), styles, lists };
}

export async function convertOdt(bytes: Uint8Array): Promise<ConvertResult> {
  const { body, lists } = open(bytes);
  const out: string[] = [];
  blocks(kids(child(body, "office:text") ?? {}), lists, out);
  return { markdown: out.join("\n\n"), warnings: [], meta: { format: "odt" } };
}

export async function convertOdp(bytes: Uint8Array): Promise<ConvertResult> {
  const { body, styles, lists } = open(bytes);
  const hidden = new Set(
    all(styles, "style:style")
      .filter((s) => attr(child(s, "style:drawing-page-properties") ?? {}, "presentation:visibility") === "hidden")
      .map((s) => attr(s, "style:name")),
  );
  const pages = all(child(body, "office:presentation"), "draw:page");
  const sections: string[] = [];
  pages.forEach((page, i) => {
    if (hidden.has(attr(page, "draw:style-name"))) return;
    let title = "";
    const content: string[] = [];
    const frames = (nodes: Node[]) => {
      for (const n of nodes) {
        if (tag(n) === "draw:g") frames(kids(n));
        else if (tag(n) === "draw:frame") {
          const cls = attr(n, "presentation:class") ?? "";
          if (SKIPPED_CLASSES.has(cls)) continue;
          if (cls === "title") title = [title, ...paras(kids(n))].filter(Boolean).join(" ");
          else blocks(kids(n), lists, content);
        }
      }
    };
    frames(kids(page));
    const notes = all(page, "presentation:notes").flatMap((nt) => all(nt, "draw:frame").filter((f) => attr(f, "presentation:class") === "notes").flatMap((f) => paras(kids(f))));
    if (!title && content.length === 0 && notes.length === 0) return;
    const notesSection = notes.length ? ["### Talaranteckningar", notes.join("\n\n")] : [];
    sections.push([`## Bild ${i + 1}${title ? `: ${title}` : ""}`, ...content, ...notesSection].join("\n\n"));
  });
  return { markdown: sections.join("\n\n"), warnings: [], meta: { format: "odp", pages: pages.length } };
}
