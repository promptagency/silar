# Changelog

Silar follows [Semantic Versioning](https://semver.org/): MAJOR for changes
that break how people use Silar or the `convert()` API, MINOR for new
features and formats, PATCH for fixes. Newest first.

## 1.7.0 (2026-11-11)

- Damaged, empty and hostile files no longer fail with a bare error. They get
  a clear Swedish message instead, under the new warning code `corrupt_file`.
  Password-protected PDFs and OpenDocument files saved as .docx, .xlsx or
  .pptx are named as such.
- Zip bombs are stopped before anything is unpacked.
- Word: a table with 10 000 rows converts in about 2 seconds instead of
  nearly two minutes. Long lists are faster too.
- Excel: a sheet whose cells sit far apart, or that has invalid cell
  references, no longer hangs.
- CSV: UTF-16 without a byte order mark and UTF-16 big-endian are read
  correctly. Binary files named .csv are refused, and control characters
  are removed from the result.
- Tests: a fuzz corpus of 153 damaged and hostile files, a robustness
  contract every conversion must meet, and a Claude Code fix loop that keeps
  working until the tests and build pass.

## 1.6.1 (2026-11-09)

- Footer link for reporting errors by email.
- README: screenshot of the start page, and what 1.6.0 added.

## 1.6.0 (2026-11-09)

- PDF: answers typed into form fields come through, next to their labels.
  Password and hidden fields are left out.
- PDF: a scanned page with a stamp or page number on it now gets a warning
  and the stamp is kept. If every page is like that, the result is the advice
  to run OCR. A heading wrapped over several lines stays one heading.
- PowerPoint: shapes hidden in the selection pane are left out.
- Excel: one unusual number format no longer fails the whole workbook. Month
  and day names are in Swedish, and true and false show as SANT and FALSKT.
- CSV: Excel's `sep=` line sets the delimiter and is no longer the table
  header. A PDF or Office file wrongly named .csv is read as what it is.
- PDF results show the token saving as three figures: as PDF in an AI chat,
  as text, and what you save.
- "Så funkar det" says that masked text in a PDF can come through.

## 1.5.0 (2026-11-08)

- PowerPoint: SmartArt text comes out as a nested list. Letters some tools
  write as number codes come out as letters.
- Word: hidden text is left out. Cells merged downward no longer push the
  rest of the row into the wrong columns.
- Excel: date-and-time cells show as yyyy-mm-dd hh:mm. Workbooks using the
  1904 date system show the right dates. An empty formatted cell far from
  the data no longer makes the file time out.
- CSV: Swedish decimals without a header row stay whole. A quote that never
  closes no longer swallows the rest of the file.
- PDF: pages drawn sideways are read correctly. PDFs also work in browsers
  without `Promise.try`, using pdf.js's legacy build.
- Very large results show the first 200 000 characters on screen. Copying
  and saving still take everything, and the page no longer freezes.
- Offline, opening a file type for the first time says the reader could not
  be fetched instead of blaming the file.

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
