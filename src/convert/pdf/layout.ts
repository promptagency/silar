// pdf.js gives positioned text pieces. These are put back into lines (top to
// bottom, left to right) and then lines into paragraphs by vertical gaps.
// Pattern from Skrubba's pdfLines.ts, plus font size per line.

export interface Item {
  str: string;
  x: number;
  y: number; // baseline, PDF units from the page bottom
  width: number;
  size: number;
}

export interface Line {
  text: string;
  x: number;
  y: number;
  size: number;
}

export function groupLines(items: Item[]): Line[] {
  const rows: Item[][] = [];
  const sorted = items.filter((i) => i.str.trim() !== "").sort((a, b) => b.y - a.y || a.x - b.x);
  for (const item of sorted) {
    const row = rows.at(-1);
    if (row && Math.abs(row[0].y - item.y) <= Math.max(row[0].size, item.size, 1) / 2) row.push(item);
    else rows.push([item]);
  }
  return rows.map((row) => {
    row.sort((a, b) => a.x - b.x);
    let text = "";
    let prev: Item | null = null;
    for (const item of row) {
      // A space where the gap is wider than a quarter of the font size.
      if (prev && item.x - (prev.x + prev.width) > Math.max(prev.size, 1) / 4 && !/\s$/.test(text) && !/^\s/.test(item.str)) text += " ";
      text += item.str;
      prev = item;
    }
    // The line's size is that of most of its characters.
    const bySize = new Map<number, number>();
    for (const i of row) bySize.set(i.size, (bySize.get(i.size) ?? 0) + i.str.length);
    const size = [...bySize].sort((a, b) => b[1] - a[1])[0][0];
    return { text: text.replace(/\s+/g, " ").trim(), x: row[0].x, y: row[0].y, size };
  });
}

/** Appends a line to running text, undoing an end-of-line hyphenation. */
export function joinText(text: string, next: string): string {
  if (!text) return next;
  // shortcut: drops the hyphen in a real compound split at a line end ("e-|post"); rare in practice.
  if (/\p{L}-$/u.test(text) && /^\p{Ll}/u.test(next)) return text.slice(0, -1) + next;
  return `${text} ${next}`;
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}
