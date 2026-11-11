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

// SheetJS writes month and day names in English, full or as three letters.
const SWEDISH_NAMES = new Map(
  "January januari,February februari,March mars,April april,May maj,June juni,July juli,August augusti,September september,October oktober,November november,December december,Monday måndag,Tuesday tisdag,Wednesday onsdag,Thursday torsdag,Friday fredag,Saturday lördag,Sunday söndag"
    .split(",")
    .flatMap((pair) => {
      const [en, sv] = pair.split(" ");
      return [[en, sv], [en.slice(0, 3), sv.slice(0, 3)]] as [string, string][];
    }),
);

function shown(c: XLSX.CellObject | undefined, formulas: { count: number }, date1904: boolean | undefined): string {
  if (!c) return "";
  if (c.f && (c.t === "z" || c.v === undefined)) {
    formulas.count++;
    return `=${c.f}`;
  }
  if (c.t === "n" && typeof c.v === "number") {
    const fmt = LOCALE_DATES.get(c.z) ?? c.z ?? "General";
    let text: string;
    try {
      text = XLSX.SSF.format(fmt, c.v, { date1904 });
    } catch {
      // shortcut: SheetJS rejects some custom formats ("0 mån", "0 m²"), so the unit is lost; parse the format ourselves if that matters.
      return String(c.v).replace(".", ",");
    }
    // shortcut: a format that asks for English ([$-409]) comes out Swedish too; look at the locale tag if that shows up.
    if (XLSX.SSF.is_date(fmt)) return text.replace(/[A-Z][a-z]+/g, (word) => SWEDISH_NAMES.get(word) ?? word);
    // shortcut: swaps en-US separators to Swedish; assumes no literal "," or "." in custom formats.
    return text.replace(/[,.]/g, (ch) => (ch === "," ? " " : ","));
  }
  if (c.t === "b") return c.v ? "SANT" : "FALSKT";
  return c.t === "z" ? "" : (c.w ?? String(c.v ?? ""));
}

/**
 * The sheet's real cells, row by row, in sheet order. Not !ref and not a
 * dense loop over the span: <dimension> can claim the whole grid
 * (A1:XFD1048576, 17 billion cells), and two cells in opposite corners span
 * just as much. Empty cells that only carry formatting do not count either.
 */
function usedCells(sheet: XLSX.WorkSheet): { rows: number[]; cols: number[]; at: Map<number, Map<number, XLSX.CellObject>> } {
  const at = new Map<number, Map<number, XLSX.CellObject>>();
  const cols = new Set<number>();
  for (const key of Object.keys(sheet)) {
    if (key.startsWith("!") || (sheet[key].t === "z" && !sheet[key].f)) continue;
    const { r, c } = XLSX.utils.decode_cell(key);
    if (!(r >= 0 && c >= 0)) continue;
    let row = at.get(r);
    if (!row) at.set(r, (row = new Map()));
    row.set(c, sheet[key]);
    cols.add(c);
  }
  const byNumber = (a: number, b: number) => a - b;
  return { rows: [...at.keys()].sort(byNumber), cols: [...cols].sort(byNumber), at };
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
    const cells = usedCells(sheet);
    const cols = cells.cols.filter((c) => !hiddenCols[c]?.hidden);
    const rows: string[][] = [];
    for (const r of cells.rows) {
      if (hiddenRows[r]?.hidden) continue;
      const at = cells.at.get(r)!;
      const row = cols.map((c) => shown(at.get(c), formulas, date1904).trim());
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
