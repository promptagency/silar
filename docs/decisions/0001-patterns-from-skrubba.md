# 0001 Mönster från Skrubba
Datum: 2026-11-06
Status: beslutad

## Läge
Skrubba (`../skrubba`) har redan läsare för Word, Excel, PowerPoint, PDF och mejl, en Web Worker per fil, en egen service worker, CSP via `_headers` och en Cloudflare Function för Plausible. Silar ska lära av det men inte bero på det. Ingen kod importeras och repona länkas inte.

Skrubba läser dokument till *ren text* med egen zip- och XML-läsare. Silar ska ge *Markdown med struktur* och använder därför andra parsers (mammoth, turndown, SheetJS, fflate, fast-xml-parser). Läsarna lånas alltså som mönster, inte som kod.

## Lånas

| Mönster | I Skrubba | I Silar |
|---|---|---|
| CSP som en konstant i `vite.config.ts`, injicerad som meta-tagg bara vid build (dev-servern har inline-skript) | `vite.config.ts` | Gjort i fas 0 |
| Samma CSP i `public/_headers` plus `frame-ancestors 'none'`, ett test håller dem lika | `public/_headers`, `scripts/headers.test.ts` | Gjort i fas 0, `tests/headers.test.ts` |
| `/assets/*` immutable, `/sw.js` `no-cache` | `public/_headers` | Gjort i fas 0 |
| En ny worker per fil, avslutas vid resultat, avbrott och timeout, filen skickas som överförd `ArrayBuffer` | `src/reader/index.ts`, `readerWorker.ts` | Fas 5 |
| Progressmeddelanden från workern per sida | `src/reader/protocol.ts` | Fas 5 (sida X av Y för PDF) |
| Format efter första bytes: `PK\x03\x04` zip, `%PDF-` någonstans i första kilobyten (som Acrobat), annars filändelse. Skrubba tittar bara på bytes för zip/pdf; Silar tar filändelsen först enligt CLAUDE.md men inspekterar sedan zip-innehållet | `src/reader/detect.ts` | Fas 1 |
| Teckenkodning: BOM vinner, sedan strikt UTF-8 (`fatal: true`), annars windows-1252. Svenska Excel-exporter är oftast cp1252 | `src/reader/decode.ts` | Fas 1, csv, med `encoding_fallback` |
| pdf.js utan nätåtkomst: `disableFontFace`, `useSystemFonts: false`, `disableAutoFetch`, `disableStream`, `useWasm: false`, `useWorkerFetch: false`, inga `cMapUrl`/`standardFontDataUrl` | `src/reader/formats/pdf.ts` | Fas 2 |
| Skannad sida = ingen text men en bildoperator (`paintImageXObject` m.fl.) i `getOperatorList()`, kollas bara på sidor utan text | `src/reader/formats/pdf.ts` | Fas 2, `no_text_layer` / `page_without_text` |
| Radgruppering av pdf.js-bitar på y med halva teckenhöjden som tolerans, mellanslag när glappet är större än en fjärdedel av teckenhöjden | `src/reader/formats/pdfLines.ts` | Fas 2, utgångspunkt för `pdf/layout.ts` |
| pptx-ordning från `presentation.xml` + dess `.rels`, inte filnamn; dolda bilder (`show="0"`) och `mc:Fallback` hoppas över | `src/reader/formats/pptx.ts` | Fas 4 |
| xlsx-element via lokalt namn (`x:c` från .NET-SDK:n = `c`) | `src/reader/formats/xlsx.ts` | Fas 1 om SheetJS inte redan klarar det |
| Egen service worker byggd som separat IIFE efter app-bygget, manifest med innehållshash per fil, föregående builds filer behålls en cykel, app-skalet hämtas från `/` (Cloudflare 301:ar `/index.html` och en SW får inte svara med en omdirigering), kill switch via `SW_KILL=1` | `src/sw/`, `vite.config.ts` | Fas 6. Valt framför vite-plugin-pwa (beslut 2026-11-06): inget nytt beroende och lätt att visa att inga användarfiler cachas |
| Plausible via `/api/event`: funktionen släpper bara igenom `pageview` för rätt domän, kapar adresser till origin + path (+ utm_*), respekterar DNT/GPC, räknar inte `navigator.webdriver`, bara på produktionsdomänen | `functions/api/event.ts`, `src/ui/analytics.ts` | Fas 6, med `silar.app` |
| Kontroll efter build att ingen fil i `dist/` är över Cloudflare Pages gräns på 25 MiB | `scripts/limits.ts` | Fas 6 om pdf.js-workern närmar sig gränsen |
| Node-version via `.node-version` (24) för Cloudflare Pages | `.node-version` | Gjort i fas 0 |

## Fallgropar att känna till
- **pdf.js 6 tar över workerns meddelanden** om det importeras direkt i en worker. Skrubba startar därför pdf.js egen worker *inuti* läsarworkern (`GlobalWorkerOptions.workerPort = new Worker(workerUrl)`) med `pdf.worker.min.mjs?url`. Silar gör likadant i fas 5.
- **`destroy()` finns på laddningsuppgiften**, inte på dokumentet, i pdf.js 6 (`task.destroy()`). Upptäckt i Silars Node-test.
- **Cloudflare Pages kan misslyckas med "Failed to publish your Function"** även när bygget gått igenom. Försök igen från dashboarden.
- **Cloudflare Web Analytics ska vara av**, den injicerar ett skript från annan origin som CSP:n stoppar.
- Skrubba har **inget Node-test av PDF**. Silar testar med `pdfjs-dist/legacy/build/pdf.mjs` i Vitest.

## Lånas inte
- Egen zip- och XML-läsare. Silar använder fflate och fast-xml-parser enligt CLAUDE.md.
- Cross-origin isolation (COOP/COEP). Skrubba behöver det för onnxruntime-trådar, Silar har inget som använder `SharedArrayBuffer`.
- `'wasm-unsafe-eval'` och `blob:` i CSP:n. Inget i Silar behöver dem i dag.
- Modellnedladdning, gzip-delning av stora filer, maskering, kodnyckel.
