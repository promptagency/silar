// Bundle size report per file in dist/, run after every build. Fails the
// build if a file the first page load fetches carries parser code
// (CLAUDE.md: "The initial page load must not include any parser code").
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { shellFiles } from "../src/sw/core.ts";

/** A string that survives minification, per parser. */
const PARSER_MARKS: Record<string, string> = {
  docx: "mammoth",
  xlsx: "SheetJS",
  csv: "windows-1252",
  pptx: "ppt/presentation.xml",
  pdf: "getDocument",
};

/** Parsers whose code is in this text. */
export const parsersIn = (text: string) => Object.keys(PARSER_MARKS).filter((p) => text.includes(PARSER_MARKS[p]));

const kB = (n: number) => `${(n / 1000).toFixed(1)} kB`.padStart(10);

export function report(dist: string): { lines: string[]; leaks: string[] } {
  const initial = new Set(shellFiles(readFileSync(join(dist, "index.html"), "utf8")));
  const rows = readdirSync(join(dist, "assets"))
    .filter((f) => /\.(m?js|css)$/.test(f))
    .map((f) => {
      const data = readFileSync(join(dist, "assets", f));
      return { path: `/assets/${f}`, raw: data.length, gzip: gzipSync(data).length, initial: initial.has(`/assets/${f}`), text: data.toString() };
    })
    .sort((a, b) => Number(b.initial) - Number(a.initial) || a.raw - b.raw);
  const lines = rows.map((r) => `${r.initial ? "first load" : "on demand "} ${kB(r.raw)} ${kB(r.gzip)} gzip  ${r.path}`);
  const first = rows.filter((r) => r.initial);
  lines.push(`first load total ${kB(first.reduce((s, r) => s + r.raw, 0))} ${kB(first.reduce((s, r) => s + r.gzip, 0))} gzip (fonts not counted)`);
  const leaks = first.flatMap((r) => parsersIn(r.text).map((p) => `${r.path} contains the ${p} parser`));
  return { lines, leaks };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { lines, leaks } = report("dist");
  console.log(`\nBundle sizes (JS and CSS):\n${lines.join("\n")}`);
  if (leaks.length) {
    console.error(`\nParser code in the first page load:\n${leaks.join("\n")}`);
    process.exit(1);
  }
}
