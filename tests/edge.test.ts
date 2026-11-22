// Edge cases from review of the robustness work, kept apart from the locked fuzz exam.
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import * as XLSX from "xlsx";
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
  const odg = zipSync({ mimetype: [strToU8("application/vnd.oasis.opendocument.graphics"), { level: 0 }], "content.xml": strToU8("<x/>") });
  const r = await run("protokoll.docx", odg);
  expect(r.warnings[0].code).toBe("unsupported_format");
  expect(r.warnings[0].message).toContain("OpenDocument");
});

it("says an empty file is empty", async () => {
  const r = await run("tom.xlsx", new Uint8Array());
  expect(r.warnings[0]).toMatchObject({ code: "corrupt_file", message: expect.stringContaining("tom") });
});

it("calls a .docx zip with an entry named after an Object method damaged, not a crash", async () => {
  const r = await run("arkiv.docx", zipSync({ constructor: strToU8("x") }));
  expect(r.warnings[0].code).toBe("corrupt_file");
});

function odsBytes() {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["Namn", "Ort"], ["Anna", "Floda"]]), "Synlig & öppen");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["Hemlig"], ["x"]]), "Dold & hemlig");
  const files = unzipSync(new Uint8Array(XLSX.write(wb, { bookType: "ods", type: "array" })));
  // SheetJS cannot write a hidden sheet; mark the second one the way LibreOffice does, on its style.
  const hide = strFromU8(files["content.xml"])
    .replace("<office:automatic-styles>", '<office:automatic-styles><style:style style:name="ta9" style:family="table"><style:table-properties table:display="false"/></style:style>')
    .replace('table:name="Dold &amp; hemlig" table:style-name="ta1"', 'table:name="Dold &amp; hemlig" table:style-name="ta9"');
  return zipSync({ ...files, "content.xml": strToU8(hide) });
}

it("reads .ods: visible sheet as a table, hidden sheet left out", async () => {
  const r = await run("kalkyl.ods", odsBytes());
  expect(r.meta).toMatchObject({ format: "ods", sheets: ["Synlig & öppen"] });
  expect(r.markdown).toContain("## Synlig & öppen");
  expect(r.markdown).toContain("| Anna | Floda |");
  expect(r.markdown).not.toContain("Hemlig");
});

it("recognises an ods by content when the extension is wrong", async () => {
  expect((await run("kalkyl.xlsx", odsBytes())).meta.format).toBe("ods");
});

it("reads xlsx bytes named .ods as xlsx, and still names an odg", async () => {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["A"], ["1"]]), "Blad");
  const xlsx = new Uint8Array(XLSX.write(wb, { bookType: "xlsx", type: "array" }));
  expect((await run("fel.ods", xlsx)).meta.format).toBe("xlsx");
  const odg = zipSync({ mimetype: [strToU8("application/vnd.oasis.opendocument.graphics"), { level: 0 }], "content.xml": strToU8("<x/>") });
  const r = await run("brev.ods", odg);
  expect(r.warnings[0].code).toBe("unsupported_format");
  expect(r.warnings[0].message).toContain("OpenDocument");
});
