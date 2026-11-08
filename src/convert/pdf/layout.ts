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

export interface Cell {
  x: number;
  text: string;
}

export interface Line {
  text: string;
  x: number;
  y: number;
  size: number;
  /** Set when the line splits at wide gaps: possibly a table row. */
  cells?: Cell[];
}

/** Items on one baseline, top to bottom, each row left to right. */
function rows(items: Item[]): Item[][] {
  const out: Item[][] = [];
  const sorted = items.filter((i) => i.str.trim() !== "").sort((a, b) => b.y - a.y || a.x - b.x);
  for (const item of sorted) {
    const row = out.at(-1);
    if (row && Math.abs(row[0].y - item.y) <= Math.max(row[0].size, item.size, 1) / 2) row.push(item);
    else out.push([item]);
  }
  for (const row of out) row.sort((a, b) => a.x - b.x);
  return out;
}

const gap = (a: Item, b: Item) => b.x - (a.x + a.width);

/** A row cut where the gap is wider than 1.5 font sizes: wider than any word space. */
function segments(row: Item[]): Item[][] {
  const out: Item[][] = [[row[0]]];
  for (let i = 1; i < row.length; i++) {
    if (gap(row[i - 1], row[i]) > Math.max(row[i - 1].size, 1) * 1.5) out.push([row[i]]);
    else out[out.length - 1].push(row[i]);
  }
  return out;
}

function text(items: Item[]): string {
  let out = "";
  let prev: Item | null = null;
  for (const item of items) {
    // A space where the gap is wider than a quarter of the font size.
    if (prev && gap(prev, item) > Math.max(prev.size, 1) / 4 && !/\s$/.test(out) && !/^\s/.test(item.str)) out += " ";
    out += item.str;
    prev = item;
  }
  return out.replace(/\s+/g, " ").trim();
}

export function groupLines(items: Item[]): Line[] {
  return rows(items).map((row) => {
    // The line's size is that of most of its characters.
    const bySize = new Map<number, number>();
    for (const i of row) bySize.set(i.size, (bySize.get(i.size) ?? 0) + i.str.length);
    const size = [...bySize].sort((a, b) => b[1] - a[1])[0][0];
    const parts = segments(row);
    const cells = parts.length > 1 ? parts.map((p) => ({ x: p[0].x, text: text(p) })) : undefined;
    return { text: text(row), x: row[0].x, y: row[0].y, size, cells };
  });
}

/**
 * A page whose text mostly runs up or down (a landscape page in a portrait
 * box, as some printer drivers write them), turned so it reads left to right.
 * Null for an ordinary page. `a` and `b` are the text's direction from pdf.js.
 * Width and height are of the page before turning, in PDF units.
 */
export function turnSideways<T extends Item & { a: number; b: number }>(items: T[], width: number, height: number): { items: T[]; width: number; height: number } | null {
  let flat = 0;
  let up = 0;
  let down = 0;
  for (const i of items) {
    if (Math.abs(i.a) >= Math.abs(i.b)) flat += i.str.length;
    else if (i.b > 0) up += i.str.length;
    else down += i.str.length;
  }
  if (flat >= up + down) return null;
  const turned = items.map((i) => (up >= down ? { ...i, x: i.y, y: width - i.x } : { ...i, x: height - i.y, y: i.x }));
  return { items: turned, width: height, height: width };
}

/**
 * Splits a page into groups in reading order. With two columns, rows that
 * stay clear of the gutter are read left column first, then right; a row
 * crossing the gutter (a title, a full-width section) ends that run.
 */
export function readingOrder(items: Item[], pageWidth: number): Item[][] {
  const all = rows(items);
  // Two-column evidence: rows of exactly two prose segments, each at least a
  // quarter of the page wide. Table rows have short cells or more of them.
  const splits = all
    .map(segments)
    .filter((s) => s.length === 2 && s.every((p) => p.at(-1)!.x + p.at(-1)!.width - p[0].x >= pageWidth / 4))
    .map(([l, r]) => (l.at(-1)!.x + l.at(-1)!.width + r[0].x) / 2);
  if (splits.length < 4) return [items];
  const gutter = median(splits);
  const out: Item[][] = [];
  let left: Item[] = [];
  let right: Item[] = [];
  const flush = () => {
    out.push(left, right);
    left = [];
    right = [];
  };
  for (const row of all) {
    if (row.some((i) => i.x < gutter && i.x + i.width > gutter)) {
      flush();
      out.push(row);
    } else for (const i of row) (i.x < gutter ? left : right).push(i);
  }
  flush();
  return out.filter((g) => g.length > 0);
}

/** Table rows as cell texts, cells put under shared column starts. */
export function tableRows(lines: Cell[][]): string[][] {
  const tolerance = 6;
  const starts: number[] = [];
  for (const x of lines.flat().map((c) => c.x).sort((a, b) => a - b)) if (!starts.length || x - starts.at(-1)! > tolerance) starts.push(x);
  return lines.map((cells) => {
    const row: string[] = Array(starts.length).fill("");
    for (const c of cells) {
      const col = starts.findLastIndex((s) => s <= c.x + tolerance);
      row[col] = row[col] ? `${row[col]} ${c.text}` : c.text;
    }
    return row;
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
