import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildSwManifest } from "../scripts/swManifest.ts";
import { parsersIn } from "../scripts/sizes.ts";
import { cacheKey, MANIFEST_KEY, networkPath, precacheList, shellFiles, staleKeys, unredirected } from "../src/sw/core.ts";

const manifest = {
  "/index.html": "aaa",
  "/manifest.webmanifest": "bbb",
  "/brand/favicon.svg": "ccc",
  "/assets/index-1.js": "ddd",
  "/assets/index-1.css": "eee",
  "/assets/schibsted-grotesk-latin-400-normal-X1.woff2": "fff",
  "/assets/schibsted-grotesk-latin-ext-700-normal-X2.woff2": "ggg",
  "/assets/schibsted-grotesk-latin-400-normal-X3.woff": "hhh",
  "/assets/jetbrains-mono-cyrillic-400-normal-X4.woff2": "iii",
  "/assets/docx-1.js": "jjj",
  "/assets/pdf.worker.min-1.mjs": "kkk",
};

describe("shellFiles", () => {
  it("lists the /-paths index.html loads", () => {
    const html = `<link rel="icon" href="/brand/favicon.svg" /><script type="module" crossorigin src="/assets/index-1.js"></script>
      <link rel="stylesheet" crossorigin href="/assets/index-1.css"><a href="https://promptagency.se">x</a>`;
    expect(shellFiles(html)).toEqual(["/brand/favicon.svg", "/assets/index-1.js", "/assets/index-1.css"]);
  });
});

describe("precacheList", () => {
  it("fetches the app shell and Swedish woff2 fonts on install, and leaves parsers to first use", () => {
    expect(precacheList(manifest, ["/brand/favicon.svg", "/assets/index-1.js", "/assets/index-1.css"])).toEqual([
      "/index.html",
      "/manifest.webmanifest",
      "/brand/favicon.svg",
      "/assets/index-1.js",
      "/assets/index-1.css",
      "/assets/schibsted-grotesk-latin-400-normal-X1.woff2",
      "/assets/schibsted-grotesk-latin-ext-700-normal-X2.woff2",
    ]);
  });
});

describe("buildSwManifest", () => {
  it("maps every built file to a content revision, except the service worker and Cloudflare's _headers", () => {
    const dist = mkdtempSync(join(tmpdir(), "dist-"));
    mkdirSync(join(dist, "assets"));
    writeFileSync(join(dist, "index.html"), "<html>");
    writeFileSync(join(dist, "assets", "a.js"), "a");
    writeFileSync(join(dist, "assets", "b.js"), "a");
    writeFileSync(join(dist, "sw.js"), "sw");
    writeFileSync(join(dist, "_headers"), "/sw.js");
    const m = buildSwManifest(dist);
    expect(Object.keys(m).sort()).toEqual(["/assets/a.js", "/assets/b.js", "/index.html"]);
    expect(m["/assets/a.js"]).toBe(m["/assets/b.js"]);
    expect(m["/index.html"]).toMatch(/^[0-9a-f]{12}$/);
  });
});

describe("staleKeys", () => {
  const origin = "https://x.test";
  const previous = { "/index.html": "old", "/assets/index-0.js": "zzz" };

  it("keeps entries of the current and the previous build, drops the rest", () => {
    const cached = [
      `${origin}/index.html?__rev=aaa`,
      `${origin}/index.html?__rev=old`,
      `${origin}/index.html?__rev=older`,
      `${origin}/assets/index-0.js?__rev=zzz`,
      `${origin}/gone.js?__rev=fff`,
    ];
    expect(staleKeys(cached, manifest, previous)).toEqual([`${origin}/index.html?__rev=older`, `${origin}/gone.js?__rev=fff`]);
  });

  it("never drops the stored manifest itself", () => {
    expect(staleKeys([`${origin}${MANIFEST_KEY}`], manifest, previous)).toEqual([]);
  });
});

describe("small helpers", () => {
  it("keys by content revision, and fetches the app shell from /", () => {
    expect(cacheKey("/assets/a.js", "abc")).toBe("/assets/a.js?__rev=abc");
    expect(networkPath("/index.html")).toBe("/");
    expect(networkPath("/assets/a.js")).toBe("/assets/a.js");
  });

  it("returns a redirected response as a plain copy, which browsers accept for a page load", async () => {
    const res = new Response("<html>", { status: 200, headers: { "content-type": "text/html" } });
    Object.defineProperty(res, "redirected", { value: true });
    const copy = await unredirected(res);
    expect(copy.redirected).toBe(false);
    expect(await copy.text()).toBe("<html>");
  });
});

describe("parsersIn (bundle gate)", () => {
  it("finds each parser by a string that survives minification", () => {
    expect(parsersIn('x="mammoth";y="SheetJS"')).toEqual(["docx", "xlsx"]);
    expect(parsersIn("createRoot(document.body)")).toEqual([]);
  });
});
