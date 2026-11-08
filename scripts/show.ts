// Prints convert() output for the given files: node scripts/show.ts path/to/file ...
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { convert } from "../src/convert/index.ts";

for (const path of process.argv.slice(2)) {
  const b = readFileSync(path);
  const r = await convert({ name: basename(path), data: b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) });
  console.log(`\n===== ${basename(path)} ${JSON.stringify(r.meta)}`);
  for (const w of r.warnings) console.log(`! ${w.code}${w.page ? ` (sida ${w.page})` : ""}: ${w.message}`);
  console.log(r.markdown);
}
