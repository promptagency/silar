# Silar

## Purpose
Silar converts documents (Word, Excel, CSV, PowerPoint, PDF) into clean Markdown that can be pasted into an AI chat. Everything runs in the browser. Files never leave the user's computer. Target users are Swedish professionals (consultants, HR, municipalities, associations) who today upload whole documents to US AI services. Built by Prompt Agency AB as a standalone product, a sibling to Skrubba, Vem sa vad and Norn.

## Stack
Silar is a standalone product with its own repo, domain and release. It shares no code or packages with Skrubba. The stack matches Skrubba on purpose, so that the converter can be brought into Skrubba later, but that is a future project and must not shape this one.
- React 19 + TypeScript (strict), built by Vite
- No UI library, plain CSS with custom properties
- PWA with a service worker that precaches the app shell and caches parser chunks on first use. It must never cache user files or conversion results
- Hosting: Cloudflare Pages, canonical domain `silar.app`
- Analytics: self-hosted Plausible, page views only, passed through one small Cloudflare Function the same way Skrubba does it. No third-party script on the page
- Reference only: Skrubba at `/Users/mikael.quick/Documents/Projects/github/skrubba` has its own readers for Word, Excel, PDF and mail, a Web Worker setup, a PWA config and a Plausible Cloudflare Function. Read them for patterns and pitfalls before writing the equivalent here. Copy small pieces if they fit, never import from that repo and never link the two projects
- Parsers, each lazy-loaded with dynamic `import()` only when a file of that type is opened. Every parser must run in both the browser and Node, because `src/convert/` is tested in Vitest on Node and will later be used in Skrubba and an n8n node:
  - docx: `mammoth` (to HTML) + `turndown` (to Markdown), with GFM table support
  - xlsx: SheetJS community edition, installed from the pinned SheetJS CDN tarball URL in package.json (the npm registry version is outdated). If the Cloudflare Pages build cannot fetch it, vendor the `.tgz` into `vendor/`
  - csv: own parser, with encoding and delimiter detection
  - pptx: `fflate` + `fast-xml-parser` (no DOMParser, it does not exist in Node)
  - pdf: `pdfjs-dist`, worker file served from the app's own domain; use the legacy build in Node tests
- The UI runs `convert()` inside a Web Worker so large files never block the page
- Tests: Vitest for converters, Playwright for one end-to-end smoke test

## Structure
```
src/
  convert/            # framework-free conversion module, no UI imports
    index.ts          # convert(file) -> { markdown, warnings, meta }
    types.ts
    detect.ts         # format detection: extension first, then zip inspection (docx/xlsx/pptx all start with PK) and %PDF header
    docx.ts
    xlsx.ts
    csv.ts
    pptx.ts
    pdf/
      index.ts
      layout.ts       # line grouping, columns, reading order
      headings.ts     # font-size based heading detection
      furniture.ts    # running header/footer and page number removal
  ui/                 # components
  styles/tokens.css   # CSS custom properties from docs/design.md
public/brand/        # logo and favicon SVGs, copied from docs/assets
  main.ts
tests/
  fixtures/           # synthetic documents, checks.json and generate.py
  fixtures/private/   # real documents, git-ignored
  convert.test.ts     # runs every entry in checks.json
docs/design.md      # design program, the source of truth for the look
docs/assets/        # logo SVGs and favicon
docs/decisions/
```

## Conventions
- UI text in Swedish, natural idiom, sentence case. Code, comments, commits in English
- The `src/convert/` module must not import anything from `src/ui/` or touch the DOM beyond what a parser strictly needs. It should be possible to lift the folder out as a package one day, but no packaging work is done now
- Public API is one function:
  ```ts
  convert(file: File | { name: string; data: ArrayBuffer }): Promise<{
    markdown: string;
    warnings: Warning[];      // { code: string; message: string; page?: number }
    meta: { format: string; pages?: number; sheets?: string[] };
  }>
  ```
- Warning codes used by tests: `no_text_layer`, `page_without_text`, `unsupported_format`, `formula_without_value`, `encoding_fallback`, `large_file`
- Token estimate: characters divided by 3.3 (Swedish text), shown as approximate. No tokenizer dependency
- Large files: soft warning above 25 MB, conversion still runs
- No new dependencies beyond those listed without asking

## Constraints
- File content must never be sent over the network. No fetch, beacon or analytics event may include file names, content or derived data
- No storage of file content (no localStorage, IndexedDB, service worker cache of user files)
- Content Security Policy: `connect-src 'self'`, `worker-src 'self'`, `script-src 'self'`. Set via Cloudflare Pages `_headers`. After page load, the only network requests allowed are same-origin static assets and the same-origin page view call to the Cloudflare Function
- All parsers and the pdf.js worker are served from the app's own domain, no third-party CDN at runtime
- The initial page load must not include any parser code. Report bundle sizes per chunk after each build

## Commands
- `npm run dev` Vite dev server (no CSP meta tag in dev)
- `npm run build` type check + production build to `dist/`, Vite prints size per chunk
- `npm test` Vitest: `tests/convert.test.ts` (checks.json), `tests/parsers.test.ts` (Node parser gate), `tests/headers.test.ts` (CSP in `_headers` = `vite.config.ts`)
- `npm run test:e2e` Playwright against a fresh build on port 4173 (first time: `npx playwright install chromium`)
- deploy: not set up yet. Planned as Cloudflare Pages Git integration, build `npm run build`, output `dist`, Node from `.node-version`

## Ask before
- Adding any dependency, service or paid API
- Deviating from `docs/design.md` (colours, type, logo usage)
- Changing the `convert()` API or the warning codes
- Anything that could send file data off the device
- Deploying to the production domain
