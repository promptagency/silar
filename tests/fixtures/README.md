# Silar test fixtures

Ten synthetic documents covering the formats and edge cases Silar must handle. All names, organisations and figures are fictional. Regenerate with `python3 tests/fixtures/generate.py` (needs python-docx, openpyxl, python-pptx, reportlab, Pillow).

`checks.json` holds machine-readable expectations per file, intended for a Vitest/Playwright suite.

| File | Tests |
|---|---|
| 01-protokoll-styrelsemote.docx | Headings, bullet and numbered lists, bold, simple table, å ä ö |
| 02-offert-sidhuvud.docx | Header/footer, nested list, merged cells, italic |
| 03-budget-forening.xlsx | Several sheets, formulas without cached values, empty sheet, title row above header |
| 04-export-svensk-excel.csv | Semicolon delimiter, decimal comma, cp1252 encoding, quoted delimiter |
| 05-workshop-presentation.pptx | Title slide, bullet levels, speaker notes, table, blank slide |
| 06-rapport-flera-sidor.pdf | Three pages, running header and page numbers to strip, heading detection |
| 07-pdf-tabell.pdf | Ruled table with empty and wrapped cells (known hard case) |
| 08-pdf-tvaspalt.pdf | Two-column reading order, marker text shows if columns interleave |
| 09-pdf-skannad.pdf | Image only, must trigger the no-text-layer warning |
| 10-pdf-blandad.pdf | Page 2 scanned, warning must name the page, rest converts |

## Check keys

- `must_contain` exact substrings in the Markdown output
- `must_not_contain` substrings that must be absent
- `must_not_contain_repeated` may appear at most once
- `order` substrings must appear in this order
- `expect_warning` warning code the converter must return
- `ideal` / `acceptable` / `should_handle` / `fail_if` guidance for manual review

## Manual quality test

The automated checks prove structure. The real test is the one from the MVP: paste the output into Claude, ask the same question as with the original file, and compare the answers. Add real-world documents to a git-ignored `tests/fixtures/private/` folder for this.
