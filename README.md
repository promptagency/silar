<p align="center">
  <img src="docs/assets/silar-logo.svg" alt="Silar" width="280">
</p>

<p align="center">
  <strong>Från dokument till AI-redo text, utan att filen lämnar datorn.</strong><br>
  From document to AI-ready text, without the file leaving your computer.
</p>

<p align="center"><a href="https://silar.app">silar.app</a></p>

[Svenska](#svenska) · [English](#english)

---

## Svenska

### Vad Silar gör

Du vill ha hjälp av en AI-tjänst med ett Word-dokument, ett Excel-ark eller en PDF. Laddar du upp filen följer allt med: metadata, bilder, dolda flikar och kommentarer, och tjänsten tolkar layouten på sitt eget sätt.

Silar plockar fram texten först och gör om den till Markdown. Rubriker, listor och tabeller behålls. Du ser exakt vad som skickas, kan stryka det som inte ska med och klistrar sedan in texten i den chatt du använder.

| Format | Vad som följer med |
| --- | --- |
| Word (.docx) | Rubriker, listor, tabeller och länkar |
| Excel (.xlsx) | En tabell per synlig flik, datum och procent som i Excel. Dolda flikar, rader och kolumner hoppas över |
| CSV (.csv) | Även svenska Excel-exporter med semikolon och Windows-teckenkodning |
| PowerPoint (.pptx) | En rubrik per bild, punktlistor och talaranteckningar. Dolda bilder hoppas över |
| PDF (.pdf) | Text, rubriker, två spalter och enkla tabeller. Sidhuvud, sidfot och sidnummer tas bort. Inskannade sidor går inte att läsa |

### Integritet

- **Filen lämnar aldrig datorn.** All läsning sker i webbläsaren, i en Web Worker. Ingen server ser filen, filnamnet eller resultatet.
- **Inget sparas.** Varken filen eller resultatet läggs i webbläsarens lagring. Service workern sparar bara appens egna filer (sidan, typsnitt och läsarna för de format du har öppnat), så att Silar fungerar utan nät efter första besöket.
- **Inga andra adresser.** Sidans Content Security Policy tillåter bara anrop till Silars egen adress. Alla läsare och pdf.js kommer därifrån.
- **Anonym besöksräkning.** På `silar.app` skickas en sidvisning till Prompt Agencys egen Plausible (i Finland), via `/api/event` på Silars egen adress. Med följer sidans adress (bara `utm_*`-taggar), föregående sida (bara domän och sökväg) och sajtens namn. Aldrig något om filen. Ingen cookie. Do Not Track och Global Privacy Control respekteras.

### Kom igång (utveckling)

Node 24 (se `.node-version`).

```sh
npm install
npm run dev        # utvecklingsserver på localhost:5173
npm test           # Vitest: konverterare, CSP, service worker, /api/event
npm run test:e2e   # Playwright mot en färsk build (första gången: npx playwright install chromium webkit)
npm run build      # build till dist/ och storleksrapport per fil
```

`node scripts/show.ts <filer>` skriver ut Markdown och varningar för en eller flera filer.

Byggd av [Prompt Agency AB](https://promptagency.se). Öppen källkod under [MIT-licensen](LICENSE).

---

## English

### What it does

You want help from an AI service with a Word document, an Excel sheet or a PDF. Uploading the file sends everything along: metadata, images, hidden sheets and comments, and the service reads the layout its own way.

Silar takes the text out first and turns it into Markdown. Headings, lists and tables are kept. You see exactly what will be sent, can cut what should not go, and paste the text into the chat you use.

| Format | What comes through |
| --- | --- |
| Word (.docx) | Headings, lists, tables and links |
| Excel (.xlsx) | One table per visible sheet, dates and percentages as Excel shows them. Hidden sheets, rows and columns are left out |
| CSV (.csv) | Including Swedish Excel exports with semicolons and Windows encoding |
| PowerPoint (.pptx) | A heading per slide, bullet lists and speaker notes. Hidden slides are left out |
| PDF (.pdf) | Text, headings, two columns and simple tables. Running headers, footers and page numbers are removed. Scanned pages cannot be read |

### Privacy

- **The file never leaves your computer.** All reading happens in the browser, in a Web Worker. No server sees the file, its name or the result.
- **Nothing is stored.** Neither the file nor the result goes into browser storage. The service worker stores only the app's own files (the page, fonts and the readers for formats you have opened), so Silar works offline after the first visit.
- **No other addresses.** The page's Content Security Policy allows requests to Silar's own address only. All readers and pdf.js are served from there.
- **Anonymous visit counting.** On `silar.app`, one page view goes to Prompt Agency's self-hosted Plausible (in Finland), through `/api/event` on Silar's own address. It carries the page address (`utm_*` tags only), the previous page (origin and path only) and the site name. Never anything about the file. No cookies. Do Not Track and Global Privacy Control are honoured.

### Getting started (development)

Node 24 (see `.node-version`).

```sh
npm install
npm run dev        # dev server on localhost:5173
npm test           # Vitest: converters, CSP, service worker, /api/event
npm run test:e2e   # Playwright against a fresh build (first time: npx playwright install chromium webkit)
npm run build      # build to dist/ and a size report per file
```

`node scripts/show.ts <files>` prints the Markdown and warnings for one or more files.

Built by [Prompt Agency AB](https://promptagency.se). Open source under the [MIT licence](LICENSE).
