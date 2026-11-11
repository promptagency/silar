// Robustness contract: every case in tests/fuzz/cases.ts must give a result or
// a known Swedish warning within the time limit. The corpus is a locked exam;
// fix failures in src/, never by changing tests/fuzz/.
import { Worker } from "node:worker_threads";
import { describe, expect, it } from "vitest";
import type { ConvertResult } from "../src/convert/types.ts";
import { fuzzCases } from "./fuzz/cases.ts";

const LIMIT_MS = 10_000;
const MAX_MARKDOWN = 50_000_000;
const CODES = new Set([
  "no_text_layer",
  "page_without_text",
  "unsupported_format",
  "formula_without_value",
  "encoding_fallback",
  "large_file",
  "corrupt_file",
]);
// Leaked exception text or code artefacts that must never reach the user.
const LEAK = /\bat .+:\d+:\d+|Error\b|TypeError|RangeError|Cannot read|is not a function|is not defined|undefined|\[object Object\]/;

type Outcome =
  | { kind: "result"; ms: number; result: ConvertResult }
  | { kind: "threw"; ms: number; error: string }
  | { kind: "timeout" }
  | { kind: "crashed"; error: string };

function run(name: string, data: Uint8Array): Promise<Outcome> {
  return new Promise((resolve) => {
    const worker = new Worker(new URL("./fuzz/runCase.ts", import.meta.url), {
      workerData: { name, data },
      resourceLimits: { maxOldGenerationSizeMb: 2048 },
    });
    let done = false;
    const finish = (o: Outcome) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      void worker.terminate();
      resolve(o);
    };
    const timer = setTimeout(() => finish({ kind: "timeout" }), LIMIT_MS);
    worker.on("message", (m: Outcome) => finish(m));
    worker.on("error", (e) => finish({ kind: "crashed", error: String(e) }));
    worker.on("exit", (code) => finish({ kind: "crashed", error: `worker exited with code ${code}` }));
  });
}

describe("robustness", () => {
  for (const c of fuzzCases()) {
    it(`${c.id} (${c.name})`, { timeout: LIMIT_MS + 5_000 }, async () => {
      const o = await run(c.name, c.data);
      expect(o.kind, `${c.note}\n${"error" in o ? o.error : ""}`).toBe("result");
      if (o.kind !== "result") return;
      const { markdown, warnings } = o.result;
      expect(typeof markdown).toBe("string");
      expect(markdown.length).toBeLessThan(MAX_MARKDOWN);
      if (markdown.trim() === "") expect(warnings.length, "empty result needs a warning").toBeGreaterThan(0);
      for (const w of warnings) {
        expect(CODES.has(w.code), `unknown warning code ${w.code}`).toBe(true);
        expect(w.message.length, "warning message too short").toBeGreaterThanOrEqual(10);
        expect(w.message, "warning leaks exception text").not.toMatch(LEAK);
      }
      expect(markdown.slice(0, 200_000), "markdown leaks code artefacts").not.toMatch(/\[object Object\]/);
    });
  }
});
