import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { CSP } from "../vite.config.ts";

// public/_headers: a path pattern, then indented "Name: value" lines.
function rules(): Map<string, Map<string, string>> {
  const out = new Map<string, Map<string, string>>();
  let current: Map<string, string> | undefined;
  for (const line of readFileSync(new URL("../public/_headers", import.meta.url), "utf8").split("\n")) {
    if (!line.trim() || line.startsWith("#")) continue;
    if (!/^\s/.test(line)) out.set(line.trim(), (current = new Map()));
    else if (current) {
      const i = line.indexOf(":");
      current.set(line.slice(0, i).trim().toLowerCase(), line.slice(i + 1).trim());
    }
  }
  return out;
}

it("sends the meta-tag CSP as a header too, plus frame-ancestors", () => {
  expect(rules().get("/*")?.get("content-security-policy")).toBe(`${CSP}; frame-ancestors 'none'`);
});

it("keeps CLAUDE.md's required CSP directives", () => {
  for (const d of ["connect-src 'self'", "worker-src 'self'", "script-src 'self'"]) expect(CSP).toContain(d);
});
