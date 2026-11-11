// CSV to a Markdown table. Strict UTF-8 first, windows-1252 as fallback
// (Swedish Excel exports), then the delimiter that splits lines most evenly.
import { table } from "./markdown.ts";
import type { ConvertResult, Warning } from "./types.ts";

const DELIMITERS = [";", ",", "\t"];

export function decode(bytes: Uint8Array): { text: string; fallback: boolean } {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return { text: new TextDecoder().decode(bytes.subarray(3)), fallback: false };
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return { text: new TextDecoder("utf-16le").decode(bytes.subarray(2)), fallback: false };
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return { text: new TextDecoder("utf-16be").decode(bytes.subarray(2)), fallback: false };
  const utf16 = utf16Order(bytes);
  if (utf16) return { text: new TextDecoder(utf16).decode(bytes), fallback: false };
  try {
    return { text: new TextDecoder("utf-8", { fatal: true }).decode(bytes), fallback: false };
  } catch {
    return { text: new TextDecoder("windows-1252").decode(bytes), fallback: true };
  }
}

/**
 * UTF-16 without a byte order mark: plain Latin text then has a zero byte in
 * every other position, on the odd side for little-endian, even for big-endian.
 */
function utf16Order(bytes: Uint8Array): "utf-16le" | "utf-16be" | null {
  const n = Math.min(bytes.length, 4096) & ~1;
  if (n < 4) return null;
  let evenZero = 0;
  let oddZero = 0;
  for (let i = 0; i < n; i += 2) {
    if (bytes[i] === 0) evenZero++;
    if (bytes[i + 1] === 0) oddZero++;
  }
  const pairs = n / 2;
  if (oddZero > pairs * 0.6 && evenZero < pairs * 0.1) return "utf-16le";
  if (evenZero > pairs * 0.6 && oddZero < pairs * 0.1) return "utf-16be";
  return null;
}

// Control characters other than tab and line breaks: never text a person wrote.
// oxlint-disable-next-line no-control-regex -- matching control characters is the point
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;

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
  // A file that is mostly control characters is binary, not a CSV with odd bytes in it.
  // Trailing NUL padding (some export tools fill out a block) does not count.
  const head = decoded.text.replace(/\0+$/, "").slice(0, 64 * 1024);
  const controls = head.match(CONTROL)?.length ?? 0;
  if (head.length === 0 ? decoded.text.length > 0 : controls > head.length * 0.1)
    return { markdown: "", warnings: [{ code: "corrupt_file", message: "Filen ser inte ut som en CSV-fil utan innehåller binära data. Exportera den som CSV igen och försök på nytt." }], meta: { format: "csv" } };
  const raw = decoded.text.replace(CONTROL, "");
  // Excel's own hint on the first line: settles the delimiter and is not data.
  const hint = /^sep=(.)(?:\r\n?|\n|$)/i.exec(raw);
  const text = hint ? raw.slice(hint[0].length) : raw;
  const warnings: Warning[] = fallback
    ? [{ code: "encoding_fallback", message: "Filen använder en äldre teckenkodning. Kontrollera att å, ä och ö ser rätt ut." }]
    : [];
  return { markdown: table(parse(text, hint?.[1] ?? sniff(text))), warnings, meta: { format: "csv" } };
}
