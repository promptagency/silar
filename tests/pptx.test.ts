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

it("numbers buAutoNum paragraphs per level and nests by the parent's marker width", async () => {
  const p = (text: string, pPr = "") => `<a:p>${pPr}<a:r><a:t>${text}</a:t></a:r></a:p>`;
  const num = (lvl = 0, extra = "") => `<a:pPr lvl="${lvl}"><a:buAutoNum type="arabicPeriod"${extra}/></a:pPr>`;
  const zip = zipSync({
    "ppt/presentation.xml": strToU8(`<p:presentation ${NS}><p:sldIdLst><p:sldId id="256" r:id="rA"/></p:sldIdLst></p:presentation>`),
    "ppt/_rels/presentation.xml.rels": strToU8(`<Relationships>${rel("rA", "slides/slide1.xml")}</Relationships>`),
    "ppt/slides/slide1.xml": strToU8(
      slide(
        sp('<p:ph type="title"/>', p("Plan")) +
          sp(
            '<p:ph idx="1"/>',
            p("Kartlägg", num()) +
              p("Intervjuer", num(1, ' type="alphaLcPeriod"')) +
              p("Enkät", num(1)) +
              p("Bygg", num()) +
              p("Testa", '<a:pPr lvl="1"/>') +
              p("Lansera", num()),
          ) +
          sp('<p:ph idx="2"/>', p("Fortsätt", num(0, ' startAt="4"')) + p("Avsluta", num())),
      ),
    ),
  });
  const { markdown } = await convertPptx(zip);
  expect(markdown).toBe(
    "## Bild 1: Plan\n\n1. Kartlägg\n   1. Intervjuer\n   2. Enkät\n2. Bygg\n   - Testa\n3. Lansera\n\n4. Fortsätt\n5. Avsluta",
  );
});

it("reads SmartArt as a nested list in the diagram's own order", async () => {
  const pt = (id: string, text: string, type = "") => `<dgm:pt modelId="${id}"${type}><dgm:t><a:p><a:r><a:t>${text}</a:t></a:r></a:p></dgm:t></dgm:pt>`;
  const cxn = (src: string, dest: string, ord: number, type = "") => `<dgm:cxn modelId="c${dest}"${type} srcId="${src}" destId="${dest}" srcOrd="${ord}" destOrd="0"/>`;
  const dgm = 'xmlns:dgm="http://schemas.openxmlformats.org/drawingml/2006/diagram" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"';
  const frame = `<p:graphicFrame><a:graphic><a:graphicData><dgm:relIds ${dgm} r:dm="rD"/></a:graphicData></a:graphic></p:graphicFrame>`;
  const zip = zipSync({
    "ppt/presentation.xml": strToU8(`<p:presentation ${NS}><p:sldIdLst><p:sldId id="256" r:id="rA"/></p:sldIdLst></p:presentation>`),
    "ppt/_rels/presentation.xml.rels": strToU8(`<Relationships>${rel("rA", "slides/slide1.xml")}</Relationships>`),
    "ppt/slides/slide1.xml": strToU8(slide(sp('<p:ph type="title"/>', "<a:p><a:r><a:t>Process</a:t></a:r></a:p>") + frame)),
    "ppt/slides/_rels/slide1.xml.rels": strToU8(`<Relationships>${rel("rD", "../diagrams/data1.xml")}</Relationships>`),
    "ppt/diagrams/data1.xml": strToU8(
      `<dgm:dataModel ${dgm}><dgm:ptLst>${pt("d", "", ' type="doc"')}${pt("2", "Andra")}${pt("11", "Underpunkt")}${pt("1", "Första")}${pt("p", "Inte med", ' type="pres"')}</dgm:ptLst>` +
        `<dgm:cxnLst>${cxn("d", "2", 1)}${cxn("d", "1", 0)}${cxn("1", "11", 0)}${cxn("1", "p", 0, ' type="presOf"')}</dgm:cxnLst></dgm:dataModel>`,
    ),
  });
  const { markdown } = await convertPptx(zip);
  expect(markdown).toBe("## Bild 1: Process\n\n- Första\n  - Underpunkt\n- Andra");
});
