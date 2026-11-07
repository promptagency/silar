import { strToU8, zipSync } from "fflate";
import { expect, it } from "vitest";
import { convertPptx } from "../src/convert/pptx.ts";

const NS = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
const sp = (ph: string, body: string) => `<p:sp><p:nvSpPr><p:cNvPr id="2" name="s"/><p:cNvSpPr/><p:nvPr>${ph}</p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/>${body}</p:txBody></p:sp>`;
const slide = (shapes: string, show = "") => `<p:sld ${NS}${show}><p:cSld><p:spTree>${shapes}</p:spTree></p:cSld></p:sld>`;
const rel = (id: string, target: string) => `<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="${target}"/>`;

it("follows presentation.xml order, skips hidden slides and footers, keeps run spacing", async () => {
  const zip = zipSync({
    "ppt/presentation.xml": strToU8(`<p:presentation ${NS}><p:sldIdLst><p:sldId id="256" r:id="rB"/><p:sldId id="257" r:id="rA"/><p:sldId id="258" r:id="rH"/></p:sldIdLst></p:presentation>`),
    "ppt/_rels/presentation.xml.rels": strToU8(`<Relationships>${rel("rA", "slides/slide1.xml")}${rel("rB", "slides/slide2.xml")}${rel("rH", "slides/slide3.xml")}</Relationships>`),
    "ppt/slides/slide1.xml": strToU8(slide(sp('<p:ph type="title"/>', "<a:p><a:r><a:t>Andra</a:t></a:r></a:p>"))),
    "ppt/slides/slide2.xml": strToU8(
      slide(
        sp('<p:ph type="title"/>', "<a:p><a:r><a:t>Första</a:t></a:r></a:p>") +
          sp("", '<a:p><a:r><a:t>Bil </a:t></a:r><a:r><a:rPr b="1"/><a:t>&amp; båt</a:t></a:r><a:br/><a:r><a:t>rad två</a:t></a:r></a:p>') +
          sp('<p:ph type="sldNum"/>', "<a:p><a:r><a:t>7</a:t></a:r></a:p>"),
      ),
    ),
    "ppt/slides/slide3.xml": strToU8(slide(sp('<p:ph type="title"/>', "<a:p><a:r><a:t>Dold</a:t></a:r></a:p>"), ' show="0"')),
  });
  const { markdown } = await convertPptx(zip);
  expect(markdown).toBe("## Bild 1: Första\n\nBil & båt rad två\n\n## Bild 2: Andra");
});
