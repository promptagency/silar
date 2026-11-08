// Headings from font size: lines clearly larger than the body text. Each
// distinct heading size gets a level, largest first.
import type { Line } from "./layout.ts";

const HEADING_RATIO = 1.15;
const MAX_HEADING_CHARS = 120;

/** The body text size: the size most characters are set in. */
export function bodySize(lines: Line[]): number {
  const chars = new Map<number, number>();
  for (const l of lines) chars.set(l.size, (chars.get(l.size) ?? 0) + l.text.length);
  return [...chars].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0;
}

/** Heading level (1-6) per line size, or nothing for body-sized lines. */
export function headingLevels(lines: Line[], body: number): Map<number, number> {
  const sizes = new Set<number>();
  for (const l of lines) if (isHeadingSized(l, body)) sizes.add(l.size);
  return new Map([...sizes].sort((a, b) => b - a).map((s, i) => [s, Math.min(i + 1, 6)]));
}

const isHeadingSized = (l: Line, body: number) => l.size >= body * HEADING_RATIO && l.text.length <= MAX_HEADING_CHARS;
