// Markdown helpers shared by the table-producing parsers (csv, xlsx, pptx).

/** One GFM table cell: no pipes or line breaks that would break the row. */
export const cell = (s: string) => s.replace(/\r?\n/g, " ").replace(/\|/g, "\\|").trim();

/** GFM table with the first row as header. Rows are padded to the widest row. */
export function table(rows: string[][]): string {
  if (rows.length === 0) return "";
  const width = Math.max(...rows.map((r) => r.length));
  const line = (r: string[]) => `| ${Array.from({ length: width }, (_, i) => cell(r[i] ?? "")).join(" | ")} |`;
  return [line(rows[0]), `|${" --- |".repeat(width)}`, ...rows.slice(1).map(line)].join("\n");
}
