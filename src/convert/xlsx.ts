// Excel (.xlsx) via SheetJS: one ## section per non-empty visible sheet.
// Hidden sheets, rows and columns are left out, as hidden slides are in pptx:
// someone hid them on purpose and they should not reach an AI chat unseen. Single-cell
// rows above the first real row (titles) become text, the rest one table.
// Cells show what Excel shows, in Swedish: dates as yyyy-mm-dd, decimal comma.
import * as XLSX from "xlsx";
import { table } from "./markdown.ts";
import type { ConvertResult, Warning } from "./types.ts";

// Built-in formats 14 and 22 are the locale's short date and date with time.
// SheetJS reports them in US form; Swedish Excel shows ISO dates.
const LOCALE_DATES = new Map<unknown, string>([
  ["m/d/yy", "yyyy-mm-dd"],
  ["m/d/yy h:mm", "yyyy-mm-dd hh:mm"],
]);

function shown(c: XLSX.CellObject | undefined, formulas: { count: number }, date1904: boolean | undefined): string {
  if (!c) return "";
  if (c.f && (c.t === "z" || c.v === undefined)) {
    formulas.count++;
    return `=${c.f}`;
  }
  if (c.t === "n" && typeof c.v === "number") {
    const fmt = LOCALE_DATES.get(c.z) ?? c.z ?? "General";
    const text: string = XLSX.SSF.format(fmt, c.v, { date1904 });
    if (XLSX.SSF.is_date(fmt)) return text;
    // shortcut: swaps en-US separators to Swedish; assumes no literal "," or "." in custom formats.
    return text.replace(/[,.]/g, (ch) => (ch === "," ? " " : ","));
  }
  return c.t === "z" ? "" : (c.w ?? String(c.v ?? ""));
}

/**
 * The range the sheet's cells actually span. Not !ref: that comes from the
 * file's <dimension> tag, which can claim the whole grid (A1:XFD1048576,
 * 17 billion cells) for a sheet with two cells in it.
 */
function usedRange(sheet: XLSX.WorkSheet): XLSX.Range | null {
  let range: XLSX.Range | null = null;
  for (const key of Object.keys(sheet)) {
    if (key.startsWith("!")) continue;
    const { r, c } = XLSX.utils.decode_cell(key);
    if (!range) range = { s: { r, c }, e: { r, c } };
    else {
      range.s.r = Math.min(range.s.r, r);
      range.s.c = Math.min(range.s.c, c);
      range.e.r = Math.max(range.e.r, r);
      range.e.c = Math.max(range.e.c, c);
    }
  }
  return range;
}

export async function convertXlsx(bytes: Uint8Array): Promise<ConvertResult> {
  // cellStyles brings the hidden flags of rows and columns.
  const book = XLSX.read(bytes, { cellNF: true, cellFormula: true, sheetStubs: true, cellStyles: true });
  const visible = book.SheetNames.filter((_, i) => !book.Workbook?.Sheets?.[i]?.Hidden);
  const formulas = { count: 0 };
  // Some workbooks, mostly from old Mac Excel, count dates from 1904.
  const date1904 = book.Workbook?.WBProps?.date1904;
  const sections: string[] = [];
  for (const name of visible) {
    const sheet = book.Sheets[name];
    const hiddenRows = sheet["!rows"] ?? [];
    const hiddenCols = sheet["!cols"] ?? [];
    const range = usedRange(sheet);
    if (!range) continue;
    const rows: string[][] = [];
    for (let r = range.s.r; r <= range.e.r; r++) {
      if (hiddenRows[r]?.hidden) continue;
      const row: string[] = [];
      for (let c = range.s.c; c <= range.e.c; c++) if (!hiddenCols[c]?.hidden) row.push(shown(sheet[XLSX.utils.encode_cell({ r, c })], formulas, date1904).trim());
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
    ? [{ code: "formula_without_value", message: `${formulas.count} ${formulas.count === 1 ? "formel" : "formler"} saknar sparat värde och visas som formel. Öppna och spara filen i Excel för att få med värdena.` }]
    : [];
  return { markdown: sections.join("\n\n"), warnings, meta: { format: "xlsx", sheets: visible } };
}
