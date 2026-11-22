// CSV to a Markdown table. Strict UTF-8 first, windows-1252 as fallback
// (Swedish Excel exports), then the delimiter that splits lines most evenly.
import { table } from "./markdown.ts";
import { CONTROL, decode, ENCODING_WARNING, isBinary } from "./text.ts";
import type { ConvertResult, Warning } from "./types.ts";

const DELIMITERS = [";", ",", "\t"];

/** RFC 4180: quoted fields may hold delimiters, line breaks and "" for a quote. */
export function parse(text: string, delimiter: string, plainFrom = Infinity): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let openedAt = 0;
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
    } else if (c === '"' && field === "" && i < plainFrom) {
      quoted = true;
      openedAt = i;
    } else if (c === delimiter) endField();
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      endRow();
    } else field += c;
  }
  // A quote that never closed would swallow the rest of the file: read it as text instead.
  if (quoted) return parse(text, delimiter, openedAt);
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
  const decoded = decode(bytes);
  const { fallback } = decoded;
  if (isBinary(decoded.text))
    return { markdown: "", warnings: [{ code: "corrupt_file", message: "Filen ser inte ut som en CSV-fil utan innehåller binära data. Exportera den som CSV igen och försök på nytt." }], meta: { format: "csv" } };
  const raw = decoded.text.replace(CONTROL, "");
  // Excel's own hint on the first line: settles the delimiter and is not data.
  const hint = /^sep=(.)(?:\r\n?|\n|$)/i.exec(raw);
  const text = hint ? raw.slice(hint[0].length) : raw;
  const warnings: Warning[] = fallback ? [ENCODING_WARNING] : [];
  return { markdown: table(parse(text, hint?.[1] ?? sniff(text))), warnings, meta: { format: "csv" } };
}
