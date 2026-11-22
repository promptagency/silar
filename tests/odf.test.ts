import { strToU8, zipSync } from "fflate";
import { expect, it } from "vitest";
import { convert } from "../src/convert/index.ts";

const NS = 'xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:presentation="urn:oasis:names:tc:opendocument:xmlns:presentation:1.0"';
const odf = (mime: string, content: string) =>
  zipSync({ mimetype: [strToU8(`application/vnd.oasis.opendocument.${mime}`), { level: 0 }], "content.xml": strToU8(`<office:document-content ${NS}>${content}</office:document-content>`) });
const run = (name: string, data: Uint8Array) => convert({ name, data: data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer });

const odt = () =>
  odf(
    "text",
    `<office:automatic-styles><text:list-style style:name="N"><text:list-level-style-number text:level="1"/></text:list-style></office:automatic-styles>
<office:body><office:text>
<text:h text:outline-level="1">Rubrik &amp; så</text:h>
<text:p>Hej<text:s text:c="2"/>på<text:tab/>dig<office:annotation><text:p>Kommentar</text:p></office:annotation><text:note><text:note-citation>1</text:note-citation><text:note-body><text:p>Fotnot</text:p></text:note-body></text:note></text:p>
<text:p>Dold<text:hidden-paragraph text:condition="true" text:is-hidden="true"/></text:p>
<text:list><text:list-item><text:p>Ett</text:p><text:list><text:list-item><text:p>Inre</text:p></text:list-item></text:list></text:list-item></text:list>
<text:list text:style-name="N"><text:list-item><text:p>Först</text:p></text:list-item><text:list-item><text:p>Sedan</text:p></text:list-item></text:list>
<text:section text:display="none"><text:p>Dold sektion</text:p></text:section>
<table:table><table:table-header-rows><table:table-row><table:table-cell><text:p>A</text:p></table:table-cell><table:table-cell><text:p>B</text:p></table:table-cell></table:table-row></table:table-header-rows>
<table:table-row><table:table-cell><text:p>1</text:p></table:table-cell><table:table-cell table:number-columns-repeated="1000000"/></table:table-row></table:table>
</office:text></office:body>`,
  );

it("reads odt: headings, spacing, lists, table; leaves out hidden text and comments", async () => {
  const r = await run("brev.odt", odt());
  expect(r.meta.format).toBe("odt");
  expect(r.markdown).toBe("# Rubrik & så\n\nHej på dig Fotnot\n\n- Ett\n  - Inre\n\n1. Först\n2. Sedan\n\n| A | B |\n| --- | --- |\n| 1 |  |");
});

it("recognises an odt by content when the extension is wrong", async () => {
  expect((await run("brev.docx", odt())).meta.format).toBe("odt");
});

const odp = () =>
  odf(
    "presentation",
    `<office:automatic-styles><style:style style:name="dp1" style:family="drawing-page"><style:drawing-page-properties presentation:visibility="hidden"/></style:style></office:automatic-styles>
<office:body><office:presentation>
<draw:page draw:name="a"><draw:frame presentation:class="title"><draw:text-box><text:p>Start</text:p></draw:text-box></draw:frame>
<draw:frame presentation:class="outline"><draw:text-box><text:list><text:list-item><text:p>Punkt</text:p></text:list-item></text:list></draw:text-box></draw:frame>
<draw:frame presentation:class="footer"><draw:text-box><text:p>Sidfot</text:p></draw:text-box></draw:frame>
<presentation:notes><draw:frame presentation:class="notes"><draw:text-box><text:p>Säg detta</text:p></draw:text-box></draw:frame></presentation:notes></draw:page>
<draw:page draw:name="b" draw:style-name="dp1"><draw:frame presentation:class="title"><draw:text-box><text:p>Dold</text:p></draw:text-box></draw:frame></draw:page>
<draw:page draw:name="c"/>
</office:presentation></office:body>`,
  );

it("reads odp: title, list, notes; skips hidden slide, footer and blank slide", async () => {
  const r = await run("bilder.odp", odp());
  expect(r.meta).toEqual({ format: "odp", pages: 3 });
  expect(r.markdown).toBe("## Bild 1: Start\n\n- Punkt\n\n### Talaranteckningar\n\nSäg detta");
});

it("recognises an odp by content when the extension is wrong", async () => {
  expect((await run("bilder.pptx", odp())).meta.format).toBe("odp");
});
