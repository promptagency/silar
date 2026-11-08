// CSV to a Markdown table. Strict UTF-8 first, windows-1252 as fallback
// (Swedish Excel exports), then the delimiter that splits lines most evenly.
import { table } from "./markdown.ts";
import type { ConvertResult, Warning } from "./types.ts";

const DELIMITERS = [";", ",", "\t"];

export function decode(bytes: Uint8Array): { text: string; fallback: boolean } {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return { text: new TextDecoder().decode(bytes.subarray(3)), fallback: false };
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return { text: new TextDecoder("utf-16le").decode(bytes.subarray(2)), fallback: false };
  try {
    return { text: new TextDecoder("utf-8", { fatal: true }).decode(bytes), fallback: false };
  } catch {
    return { text: new TextDecoder("windows-1252").decode(bytes), fallback: true };
  }
}

/** RFC 4180: quoted fields may hold delimiters, line breaks and "" for a quote. */
export function parse(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const endField = () => {
    row.push(field);
    field = "";
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c !== '"') field += c;
      else if (text[i + 1] === '"') field += text[++i];
      else quoted = false;
    } else if (c === '"' && field === "") quoted = true;
    else if (c === delimiter) endField();
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      endRow();
    } else field += c;
  }
  if (field !== "" || row.length) endRow();
  return rows.filter((r) => r.some((f) => f.trim() !== ""));
}

/** The delimiter giving the most columns while every sampled row agrees. */
export function sniff(text: string): string {
  let best = DELIMITERS[0];
  let bestScore = 0;
  const sample = text.slice(0, 64 * 1024);
  for (const d of DELIMITERS) {
    const widths = parse(sample, d).slice(0, 20).map((r) => r.length);
    if (widths.length === 0 || widths[0] < 2) continue;
    const agree = widths.filter((w) => w === widths[0]).length / widths.length;
    // An even split on ";" settles it: Swedish decimal commas would otherwise out-count it.
    if (d === ";" && agree === 1) return d;
    const score = widths[0] * agree * agree;
    if (score > bestScore) {
      best = d;
      bestScore = score;
    }
  }
  return best;
}

export async function convertCsv(bytes: Uint8Array): Promise<ConvertResult> {
  const { text, fallback } = decode(bytes);
  const warnings: Warning[] = fallback
    ? [{ code: "encoding_fallback", message: "Filen använder en äldre teckenkodning. Kontrollera att å, ä och ö ser rätt ut." }]
    : [];
  return { markdown: table(parse(text, sniff(text))), warnings, meta: { format: "csv" } };
}
