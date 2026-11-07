# Plan

## Goal of this iteration
A working MVP at `silar.app` where a user can drop one docx, xlsx, csv, pptx or pdf file and get Markdown to preview, copy and download, fully offline in the browser. Done means:
- All entries in `tests/fixtures/checks.json` pass (`must_contain`, `must_not_contain`, `must_not_contain_repeated`, `order`, `expect_warning`)
- Scanned and partially scanned PDFs produce clear Swedish warnings
- The initial page load contains no parser code
- After page load, the only network requests are same-origin (static assets and the page view function), verified in the Playwright test

Phases are ordered by risk. PDF is the part most likely to sink the product, so it comes right after the converter core.

## Phases

### Phase 0 – Setup
- [x] Read Skrubba's document readers, worker setup, PWA config and Plausible Cloudflare Function at `/Users/mikael.quick/Documents/Projects/github/skrubba`. Write `docs/decisions/0001-patterns-from-skrubba.md` listing which patterns are borrowed. No code dependency between the repos
- [x] Scaffold Vite + React 19 + TypeScript, plain CSS, PWA plugin
- [x] Fixtures in `tests/fixtures/`, `tests/fixtures/private/` in `.gitignore` (done at handoff)
- [x] Vitest harness that loops over `checks.json`, applies the machine-checkable keys and ignores the rest (`ideal`, `acceptable`, `should_handle`, `fail_if` are for manual review). All failing is expected
- [x] Confirm every chosen parser imports and runs in Node (Vitest) before building on it
- [x] `_headers` with CSP, Cloudflare Pages deploy at `https://silar.pages.dev` (Git-connected, private repo `promptagency/silar`)
Checkpoint: show the repo structure, the failing test report and the preview URL.

### Phase 1 – Converter core, docx, csv, xlsx
- [x] `convert()`, format detection (extension, then zip inspection, then `%PDF`), `unsupported_format` and `large_file` warnings
- [x] docx via mammoth + turndown, GFM tables, hyperlinks kept as `[text](url)`, header/footer not in output
- [x] csv with encoding detection (strict UTF-8 decode, fallback windows-1252 with `encoding_fallback`) and delimiter sniffing (`;` `,` tab)
- [x] xlsx: one `##` section per non-empty sheet, Markdown table per sheet, title rows above the header handled, dates and percentages rendered as displayed text not serial numbers, `formula_without_value` when cached values are missing
- [x] Extend `tests/fixtures/generate.py` with two fixtures: an xlsx with date and percentage cells, a docx with hyperlinks. Add their checks to `checks.json`
- [x] Each parser lazy-loaded
Checkpoint: fixtures 01 to 04 plus the two new ones pass. Show the Markdown output of each.

### Phase 2 – PDF, text and structure
- [x] Text extraction with pdf.js, lines grouped from text items by position
- [x] Per-page text check, `no_text_layer` for fully scanned files, `page_without_text` with page number for mixed files
- [x] Running header, footer and page number removal: lines in the top or bottom band that repeat on most pages after digits are normalised. Skip for single-page documents
- [x] Heading detection from font size relative to the body text median
- [x] Paragraph joining across line and page breaks
Checkpoint: fixtures 06, 09 and 10 pass. Show the output of 06 next to the PDF.

### Phase 3 – PDF, columns and tables
- [ ] Two-column detection so columns are read in order
- [ ] Tables: best effort only, each row kept on one line with cell values in order
Checkpoint: fixtures 07 and 08 pass. Show both outputs side by side with the PDFs and stop. Micke decides whether table handling is good enough for the MVP or needs more work before the UI.

### Phase 4 – pptx
- [ ] Slide order from `presentation.xml` relationships, not file names
- [ ] One section per slide, title as heading, bullet levels as indented lists, tables as Markdown tables
- [ ] Speaker notes included under a marked subheading, blank slides skipped
Checkpoint: fixture 05 passes. Show output.

### Phase 5 – Interface
- [ ] `convert()` running in a Web Worker, UI talks to it by message
- [ ] Tokens from `docs/design.md` as CSS custom properties, fonts self-hosted via @fontsource
- [ ] Layout and branding per `docs/design.md`, logo and favicon from `docs/assets/`
- [ ] Drop zone and file picker, one file at a time
- [ ] Progress state while a parser loads the first time
- [ ] Markdown preview (raw text), copy button, download as `.md`
- [ ] Character count and approximate token count, labelled as approximate
- [ ] Warnings shown in Swedish above the result
- [ ] Short text explaining that the file never leaves the computer
Checkpoint: show the working flow on the preview URL, desktop and phone width.

### Phase 6 – Launch preparation
- [ ] Playwright smoke test: convert one fixture per format and assert that every network request after load is same-origin
- [ ] Page view via Cloudflare Function to Plausible, copied from Skrubba
- [ ] Service worker verified to cache only app shell and parser chunks, never user data
- [ ] Bundle size report per chunk, initial load must contain no parser
- [ ] README in Swedish and English
Checkpoint: ask before connecting `silar.app` and deploying to production.

## Out of scope
- Masking of personal data and any Skrubba integration (separate future project)
- Multiple files at once
- OCR, image description, audio
- Legacy formats .doc, .xls, .ppt
- Advanced PDF table reconstruction
- Images, footnotes, comments and tracked changes in docx
- HTTP API, n8n node, npm package publishing

## Open questions
- Repo name, suggested `promptagency/silar`
- Open source from the start, same licence and licence holder as Skrubba
- Target size for the initial page load
- Whether `silar.app` is registered and whether a promptagency.se subdomain should redirect to it
