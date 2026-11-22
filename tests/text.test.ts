import { zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { convert } from "../src/convert/index.ts";

const run = (name: string, data: Uint8Array | string) => {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  return convert({ name, data: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer });
};

describe("txt and md", () => {
  it("reads windows-1252 and warns", async () => {
    const r = await run("a.txt", Uint8Array.from([0x68, 0xe5, 0x6c, 0x6c, 0x20, 0xe4, 0xf6]));
    expect(r.markdown).toBe("håll äö");
    expect(r.meta.format).toBe("txt");
    expect(r.warnings.map((w) => w.code)).toEqual(["encoding_fallback"]);
  });

  it("refuses binary data", async () => {
    const r = await run("a.txt", Uint8Array.from({ length: 200 }, (_, i) => i % 8));
    expect(r.markdown).toBe("");
    expect(r.warnings.map((w) => w.code)).toEqual(["corrupt_file"]);
  });

  it("normalises md and keeps it otherwise", async () => {
    const r = await run("a.markdown", "# Rubrik  \r\n\r\n\r\n\r\n- punkt\t\r\n\r\n");
    expect(r.markdown).toBe("# Rubrik\n\n- punkt");
    expect(r.meta.format).toBe("md");
  });

  it("does not read a zip named .txt as text", async () => {
    const r = await run("a.txt", zipSync({ "x.txt": new TextEncoder().encode("hej") }));
    expect(r.warnings.map((w) => w.code)).toEqual(["unsupported_format"]);
  });
});

describe("html", () => {
  const page = `<!doctype html><html><head><title>Titel</title><style>.x{color:red}</style></head><body>
    <script>alert("SCRIPTTEXT")</script><h2>Del</h2><p>Se <a href="https://silar.app">Silar</a>.</p>
    <ul><li>a<ul><li>b</li></ul></li><li>c</li></ul>
    <table><tr><th>N</th><th>V</th></tr><tr><td>x</td><td>1</td></tr></table><img src="a.png"></body></html>`;

  it("converts structure and drops script and style", async () => {
    const r = await run("a.html", page);
    expect(r.meta.format).toBe("html");
    expect(r.markdown).toContain("# Titel");
    expect(r.markdown).toContain("## Del");
    expect(r.markdown).toContain("[Silar](https://silar.app)");
    expect(r.markdown).toMatch(/- a\n {2}- b\n- c/);
    expect(r.markdown).toContain("| N | V |\n| --- | --- |\n| x | 1 |");
    expect(r.markdown).not.toMatch(/SCRIPTTEXT|color:red|a\.png/);
  });

  it("leaves the title out when the body has an h1", async () => {
    const r = await run("a.htm", "<title>Titel</title><h1>Egen</h1><p>text</p>");
    expect(r.markdown).toBe("# Egen\n\ntext");
  });
});
