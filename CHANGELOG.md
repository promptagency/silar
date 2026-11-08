# Changelog

Silar follows [Semantic Versioning](https://semver.org/): MAJOR for changes
that break how people use Silar or the `convert()` API, MINOR for new
features and formats, PATCH for fixes. Newest first.

## 1.4.0 (2026-11-08)

- PDF results also show approximately how many tokens the PDF itself would
  use: its text plus one page image per page, based on how Claude reads
  PDFs. Other formats are unchanged.

## 1.3.0 (2026-11-08)

- "Silade filer": up to 10 results from this tab, under the privacy line.
  Click one to show it again. Kept in memory only, never stored; the list
  is gone when the tab closes.
- The privacy line sits right under the drop zone, next to every result.
- Footer links to the source code on GitHub.

## 1.2.0 (2026-11-08)

- Desktop: drop zone on the left, result on the right. Before the first
  file the right panel shows a dimmed example; the drop zone stays next to
  the result, so a new file replaces it directly. Phones keep one column.
- New heading: "Sila dina texter. Spara dina tokens."
- The comparison and format sections are gone; the "Så funkar det" FAQ
  covers both.
- Privacy line: dark text and an orange (Glöd) lock, a recorded exception
  in docs/design.md.
- CI runs the browser tests in all five setups.

## 1.1.0 (2026-11-08)

- New heading: "Sila fram texten. Spara dina tokens." The subtitle is gone.
- "Så funkar det" opens as a modal with the three steps and an FAQ of ten
  questions, one answer open at a time. It starts with why Markdown beats
  uploading the file, and lists the open-source libraries Silar uses.
- Comparison heading: "Varför ska du sila texten först?"
- Build: the first-load parser check looks for library API names, so the
  FAQ can name the libraries.

## 1.0.0 (2026-11-08)

First versioned release of what runs on silar.app: Word, Excel, CSV,
PowerPoint and PDF to Markdown in the browser, offline after the first
visit, cancel with Avbryt or Esc, version number in the footer.
