// Display helpers: numbers, counts and warnings in Swedish.
import type { ConvertResult, Warning, WarningCode } from "../convert/types.ts";

const nf = new Intl.NumberFormat("sv-SE");
export const num = (n: number) => nf.format(n);

/** Characters divided by 3.3, a rough figure for Swedish text. */
export const approxTokens = (chars: number) => Math.round(chars / 3.3);

const FORMAT_NAMES: Record<string, string> = { docx: "Word", xlsx: "Excel", csv: "CSV", pptx: "PowerPoint", pdf: "PDF" };

/** Format name from a file name, for "loading the PDF reader" before the result tells us. */
export function formatName(fileName: string): string | null {
  const ext = /\.([a-z0-9]+)$/i.exec(fileName)?.[1]?.toLowerCase() ?? "";
  return FORMAT_NAMES[ext] ?? null;
}

/** "3 sidor", "4 bilder", "2 flikar", or nothing. */
export function extent(meta: ConvertResult["meta"]): string | null {
  if (meta.format === "xlsx" && meta.sheets) return `${num(meta.sheets.length)} ${meta.sheets.length === 1 ? "flik" : "flikar"}`;
  if (meta.pages === undefined) return null;
  if (meta.format === "pptx") return `${num(meta.pages)} ${meta.pages === 1 ? "bild" : "bilder"}`;
  return `${num(meta.pages)} ${meta.pages === 1 ? "sida" : "sidor"}`;
}

const TITLES: Record<WarningCode, string> = {
  no_text_layer: "Ingen text att sila",
  page_without_text: "Sidor utan text",
  unsupported_format: "Formatet stöds inte",
  formula_without_value: "Formler utan värden",
  encoding_fallback: "Teckenkodning",
  large_file: "Stor fil",
};

export interface Notice {
  code: WarningCode;
  title: string;
  message: string;
}

/** One notice per warning code; scanned pages are listed together. */
export function notices(warnings: Warning[]): Notice[] {
  const out: Notice[] = [];
  const pages = warnings.filter((w) => w.code === "page_without_text" && w.page !== undefined).map((w) => w.page!);
  for (const w of warnings) {
    if (out.some((n) => n.code === w.code)) continue;
    const message =
      w.code === "page_without_text" && pages.length > 1
        ? `Sidorna ${pages.slice(0, -1).join(", ")} och ${pages.at(-1)} saknar text, de är troligen inskannade. De finns inte med i resultatet.`
        : w.message;
    out.push({ code: w.code, title: TITLES[w.code], message });
  }
  return out;
}

/** "rapport.pdf" → "rapport.md" */
export const markdownName = (fileName: string) => `${fileName.replace(/\.[^.]+$/, "") || "silat"}.md`;
