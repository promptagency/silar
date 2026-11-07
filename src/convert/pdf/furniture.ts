// Running headers, footers and page numbers: lines in the top or bottom band
// of the page that repeat on most pages once digits are ignored.
import type { Line } from "./layout.ts";

const BAND = 0.1; // share of the page height, top and bottom

const key = (text: string) => text.replace(/\d+/g, "#").toLowerCase();

export function removeFurniture(pages: { lines: Line[]; height: number }[]): Line[][] {
  const withText = pages.filter((p) => p.lines.length > 0);
  if (withText.length < 2) return pages.map((p) => p.lines);
  const inBand = (l: Line, height: number) => l.y > height * (1 - BAND) || l.y < height * BAND;
  const seen = new Map<string, number>();
  for (const p of withText) {
    const keys = new Set(p.lines.filter((l) => inBand(l, p.height)).map((l) => key(l.text)));
    for (const k of keys) seen.set(k, (seen.get(k) ?? 0) + 1);
  }
  // "Most pages": more than half, and at least two.
  const repeated = (k: string) => (seen.get(k) ?? 0) >= Math.max(2, withText.length / 2 + 0.5);
  return pages.map((p) => p.lines.filter((l) => !(inBand(l, p.height) && repeated(key(l.text)))));
}
