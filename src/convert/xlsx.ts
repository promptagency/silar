// Excel (.xlsx) via SheetJS: one ## section per non-empty sheet. Single-cell
// rows above the first real row (titles) become text, the rest one table.
// Cells show what Excel shows, in Swedish: dates as yyyy-mm-dd, decimal comma.
import * as XLSX from "xlsx";
import { table } from "./markdown.ts";
import type { ConvertResult, Warning } from "./types.ts";

// Built-in format 14 is the locale's short date. SheetJS reports it as
// US "m/d/yy"; Swedish Excel shows ISO dates.
const LOCALE_SHORT_DATE = "m/d/yy";

function shown(c: XLSX.CellObject | undefined, formulas: { count: number }): string {
  if (!c) return "";
  if (c.f && (c.t === "z" || c.v === undefined)) {
    formulas.count++;
    return `=${c.f}`;
  }
  if (c.t === "n" && typeof c.v === "number") {
    const fmt = c.z === LOCALE_SHORT_DATE ? "yyyy-mm-dd" : (c.z ?? "General");
    const text: string = XLSX.SSF.format(fmt, c.v);
    if (XLSX.SSF.is_date(fmt)) return text;
    // shortcut: swaps en-US separators to Swedish; assumes no literal "," or "." in custom formats.
    return text.replace(/[,.]/g, (ch) => (ch === "," ? " " : ","));
  }
  return c.t === "z" ? "" : (c.w ?? String(c.v ?? ""));
}

export async function convertXlsx(bytes: Uint8Array): Promise<ConvertResult> {
  const book = XLSX.read(bytes, { cellNF: true, cellFormula: true, sheetStubs: true });
  const formulas = { count: 0 };
  const sections: string[] = [];
  for (const name of book.SheetNames) {
    const sheet = book.Sheets[name];
    if (!sheet["!ref"]) continue;
    const range = XLSX.utils.decode_range(sheet["!ref"]);
    const rows: string[][] = [];
    for (let r = range.s.r; r <= range.e.r; r++) {
      const row: string[] = [];
      for (let c = range.s.c; c <= range.e.c; c++) row.push(shown(sheet[XLSX.utils.encode_cell({ r, c })], formulas).trim());
      if (row.some(Boolean)) rows.push(row);
    }
    if (rows.length === 0) continue;
    // Drop columns that are empty in every row.
    const used = rows[0].map((_, i) => rows.some((r) => r[i]));
    const kept = rows.map((r) => r.filter((_, i) => used[i]));
    const firstTableRow = kept.findIndex((r) => r.filter(Boolean).length > 1);
    const titles = firstTableRow === -1 ? kept : kept.slice(0, firstTableRow);
    const body = firstTableRow === -1 ? [] : kept.slice(firstTableRow);
    sections.push([`## ${name}`, ...titles.map((r) => r.filter(Boolean).join(" ")), table(body)].filter(Boolean).join("\n\n"));
  }
  const warnings: Warning[] = formulas.count
    ? [{ code: "formula_without_value", message: `${formulas.count} formler saknar sparat värde och visas som formel. Öppna och spara filen i Excel för att få med värdena.` }]
    : [];
  return { markdown: sections.join("\n\n"), warnings, meta: { format: "xlsx", sheets: book.SheetNames } };
}
