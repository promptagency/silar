// Runs every entry in tests/fixtures/checks.json against convert(). Only the
// machine-checkable keys are applied; ideal, acceptable, should_handle and
// fail_if are for manual review.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { convert } from "../src/convert/index.ts";
import type { ConvertResult } from "../src/convert/types.ts";

interface Check {
  must_contain?: string[];
  must_not_contain?: string[];
  must_not_contain_repeated?: string[];
  order?: string[];
  expect_warning?: string; // "code" or "code: page"
}

const dir = new URL("./fixtures/", import.meta.url);
const checks: Record<string, Check> = JSON.parse(readFileSync(new URL("checks.json", dir), "utf8"));

const count = (haystack: string, needle: string) => haystack.split(needle).length - 1;

for (const [name, check] of Object.entries(checks)) {
  describe(name, () => {
    let result: Promise<ConvertResult> | undefined;
    const run = () => {
      const bytes = readFileSync(new URL(name, dir));
      result ??= convert({ name, data: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) });
      return result;
    };

    for (const s of check.must_contain ?? [])
      it(`contains ${JSON.stringify(s)}`, async () => expect((await run()).markdown).toContain(s));

    for (const s of check.must_not_contain ?? [])
      it(`does not contain ${JSON.stringify(s)}`, async () => expect((await run()).markdown).not.toContain(s));

    for (const s of check.must_not_contain_repeated ?? [])
      it(`has ${JSON.stringify(s)} at most once`, async () => expect(count((await run()).markdown, s)).toBeLessThanOrEqual(1));

    if (check.order)
      it(`keeps order ${check.order.join(" → ")}`, async () => {
        const { markdown } = await run();
        const at = check.order!.map((s) => markdown.indexOf(s));
        expect(at.every((i) => i >= 0)).toBe(true);
        expect(at).toEqual([...at].sort((a, b) => a - b));
      });

    if (check.expect_warning) {
      const [code, page] = check.expect_warning.split(":").map((s) => s.trim());
      it(`warns ${check.expect_warning}`, async () => {
        const { warnings } = await run();
        expect(warnings).toContainEqual(expect.objectContaining(page ? { code, page: Number(page) } : { code }));
      });
    }
  });
}
