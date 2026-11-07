// PowerPoint (.pptx) via fflate + fast-xml-parser. Slides in the order of
// presentation.xml (not file names), one ## section per slide, shapes in
// drawing order, body placeholders as indented lists, tables as GFM tables,
// speaker notes under their own subheading. Blank and hidden slides are
// skipped; slide date, footer and number placeholders are left out.
import { XMLParser } from "fast-xml-parser";
import { strFromU8, unzipSync } from "fflate";
import { table } from "./markdown.ts";
import type { ConvertResult } from "./types.ts";

type Node = Record<string, unknown>;

// preserveOrder keeps shapes and runs in document order; trimValues: false
// keeps the spaces between runs.
const parser = new XMLParser({
  preserveOrder: true,
  ignoreAttributes: false,
  attributeNamePrefix: "",
  trimValues: false,
  parseTagValue: false,
  parseAttributeValue: false,
});

const tag = (n: Node) => Object.keys(n).find((k) => k !== ":@") ?? "";
const kids = (n: Node): Node[] => (Array.isArray(n[tag(n)]) ? (n[tag(n)] as Node[]) : []);
const attr = (n: Node, name: string) => (n[":@"] as Record<string, string> | undefined)?.[name];
const child = (n: Node | undefined, name: string) => (n ? kids(n).find((k) => tag(k) === name) : undefined);
const path = (n: Node | undefined, ...names: string[]) => names.reduce<Node | undefined>((cur, name) => child(cur, name), n);
const all = (n: Node | undefined, name: string) => (n ? kids(n).filter((k) => tag(k) === name) : []);

function text(n: Node): string {
  const t = tag(n);
  if (t === "#text") return String(n["#text"]);
  if (t === "a:br") return " ";
  if (t === "a:pPr" || t === "a:rPr" || t === "a:endParaRPr") return "";
  return kids(n).map(text).join("");
}

const paraText = (p: Node) => text(p).replace(/\s+/g, " ").trim();

/** Zip part path relative to another part ("ppt/slides/slide1.xml" + "../notesSlides/n.xml"). */
function resolve(from: string, target: string): string {
  if (target.startsWith("/")) return target.slice(1);
  const parts = from.split("/").slice(0, -1);
  for (const seg of target.split("/")) {
    if (seg === "..") parts.pop();
    else if (seg !== ".") parts.push(seg);
  }
  return parts.join("/");
}

const SKIPPED_PLACEHOLDERS = new Set(["dt", "ftr", "sldNum", "hdr", "sldImg"]);

interface Slide {
  title: string;
  blocks: string[];
}

function shapes(nodes: Node[], slide: Slide): void {
  for (const n of nodes) {
    const t = tag(n);
    if (t === "p:grpSp") shapes(kids(n), slide);
    else if (t === "mc:AlternateContent") shapes(kids(child(n, "mc:Choice") ?? {}), slide);
    else if (t === "p:graphicFrame") {
      const tbl = path(n, "a:graphic", "a:graphicData", "a:tbl");
      if (tbl) slide.blocks.push(table(all(tbl, "a:tr").map((tr) => all(tr, "a:tc").map((tc) => all(child(tc, "a:txBody"), "a:p").map(paraText).filter(Boolean).join(" ")))));
    } else if (t === "p:sp") {
      const ph = path(n, "p:nvSpPr", "p:nvPr", "p:ph");
      const type = ph ? (attr(ph, "type") ?? "body") : null;
      if (type && SKIPPED_PLACEHOLDERS.has(type)) continue;
      const paras = all(child(n, "p:txBody"), "a:p")
        .map((p) => ({ p, text: paraText(p), pPr: child(p, "a:pPr") }))
        .filter((x) => x.text);
      if (paras.length === 0) continue;
      if (type === "title" || type === "ctrTitle") {
        slide.title = [slide.title, ...paras.map((x) => x.text)].filter(Boolean).join(" ");
        continue;
      }
      // Body and content placeholders are bulleted unless a paragraph says buNone;
      // text boxes only when a paragraph asks for a bullet.
      // Numbered paragraphs (buAutoNum) count per level; a shallower item or a
      // plain bullet at the same level restarts the count. Letters and roman
      // numerals become 1., 2. too: Markdown has no other list numbers.
      // shortcut: numbering set only in the slide layout or master comes out as "-".
      const counts: number[] = [];
      const widths: number[] = [];
      const lines = paras.map(({ text, pPr }) => {
        const auto = pPr ? child(pPr, "a:buAutoNum") : undefined;
        const bulleted = pPr && (child(pPr, "a:buChar") || auto) ? true : pPr && child(pPr, "a:buNone") ? false : type === "body" || type === "obj";
        if (!bulleted) {
          counts.length = 0;
          return text;
        }
        const lvl = Number(attr(pPr ?? {}, "lvl") ?? 0);
        counts.length = auto ? lvl + 1 : lvl;
        const marker = auto ? `${(counts[lvl] = (counts[lvl] ?? Number(attr(auto, "startAt") ?? 1) - 1) + 1)}. ` : "- ";
        widths[lvl] = marker.length;
        // Indented by the parents' marker widths, so "1. " nests by 3 and "- " by 2.
        const indent = widths.slice(0, lvl).reduce((sum, w) => sum + (w ?? 2), 0);
        return `${" ".repeat(indent)}${marker}${text}`;
      });
      slide.blocks.push(lines.join(lines.every((l) => /^\s*(- |\d+\. )/.test(l)) ? "\n" : "\n\n"));
    }
  }
}

export async function convertPptx(bytes: Uint8Array): Promise<ConvertResult> {
  // Only XML parts are inflated, never media.
  const files = unzipSync(bytes, { filter: (f) => f.name.endsWith(".xml") || f.name.endsWith(".rels") });
  const read = (name: string) => (files[name] ? (parser.parse(strFromU8(files[name])) as Node[]) : []);
  const rels = (part: string) => {
    const relsPart = resolve(part, `_rels/${part.split("/").at(-1)}.rels`);
    const root = read(relsPart).find((n) => tag(n) === "Relationships");
    return new Map(all(root, "Relationship").map((r) => [attr(r, "Id") ?? "", { type: attr(r, "Type") ?? "", target: resolve(part, attr(r, "Target") ?? "") }]));
  };

  const presentation = read("ppt/presentation.xml").find((n) => tag(n) === "p:presentation");
  const presRels = rels("ppt/presentation.xml");
  const slideParts = all(child(presentation, "p:sldIdLst"), "p:sldId")
    .map((s) => presRels.get(attr(s, "r:id") ?? "")?.target)
    .filter((p): p is string => !!p);

  const sections: string[] = [];
  slideParts.forEach((part, i) => {
    const sld = read(part).find((n) => tag(n) === "p:sld");
    if (!sld || attr(sld, "show") === "0") return;
    const slide: Slide = { title: "", blocks: [] };
    shapes(kids(path(sld, "p:cSld", "p:spTree") ?? {}), slide);

    const notesPart = [...rels(part).values()].find((r) => r.type.endsWith("/notesSlide"))?.target;
    const notesTree = notesPart ? path(read(notesPart).find((n) => tag(n) === "p:notes"), "p:cSld", "p:spTree") : undefined;
    const notes = all(notesTree, "p:sp")
      .filter((sp) => attr(path(sp, "p:nvSpPr", "p:nvPr", "p:ph") ?? {}, "type") === "body")
      .flatMap((sp) => all(child(sp, "p:txBody"), "a:p").map(paraText))
      .filter(Boolean);

    if (!slide.title && slide.blocks.length === 0 && notes.length === 0) return;
    const heading = `## Bild ${i + 1}${slide.title ? `: ${slide.title}` : ""}`;
    const notesSection = notes.length ? ["### Talaranteckningar", notes.join("\n\n")] : [];
    sections.push([heading, ...slide.blocks, ...notesSection].join("\n\n"));
  });

  return { markdown: sections.join("\n\n"), warnings: [], meta: { format: "pptx", pages: slideParts.length } };
}
