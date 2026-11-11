// Edge cases from review of the robustness work, kept apart from the locked fuzz exam.
import { strToU8, zipSync } from "fflate";
import { expect, it } from "vitest";
import { convert } from "../src/convert/index.ts";

const run = (name: string, bytes: Uint8Array) => convert({ name, data: bytes.slice().buffer });

it("converts a CSV padded with trailing NUL bytes", async () => {
  const csv = new Uint8Array([...strToU8("Namn;Ort\nAnna;Floda\n"), ...new Uint8Array(200)]);
  const r = await run("export.csv", csv);
  expect(r.warnings.map((w) => w.code)).not.toContain("corrupt_file");
  expect(r.markdown).toContain("| Anna | Floda |");
});

it("names OpenDocument files instead of calling them damaged", async () => {
  const odt = zipSync({ mimetype: [strToU8("application/vnd.oasis.opendocument.text"), { level: 0 }], "content.xml": strToU8("<x/>") });
  const r = await run("protokoll.docx", odt);
  expect(r.warnings[0].code).toBe("unsupported_format");
  expect(r.warnings[0].message).toContain("OpenDocument");
});

it("says an empty file is empty", async () => {
  const r = await run("tom.xlsx", new Uint8Array());
  expect(r.warnings[0]).toMatchObject({ code: "corrupt_file", message: expect.stringContaining("tom") });
});
