// Markdown helpers shared by the table-producing parsers (csv, xlsx, pptx).

/** One GFM table cell: no pipes or line breaks that would break the row. */
export const cell = (s: string) => s.replace(/[\r\n]+/g, " ").replace(/\|/g, "\\|").trim();

/** GFM table with the first row as header. Rows are padded to the widest row. */
export function table(rows: string[][]): string {
  if (rows.length === 0) return "";
  // Not Math.max(...rows): spreading 100 000+ rows overflows the call stack.
  const width = rows.reduce((w, r) => Math.max(w, r.length), 0);
  const line = (r: string[]) => `| ${Array.from({ length: width }, (_, i) => cell(r[i] ?? "")).join(" | ")} |`;
  return [line(rows[0]), `|${" --- |".repeat(width)}`, ...rows.slice(1).map(line)].join("\n");
}
