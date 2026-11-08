# Silar compared with MarkItDown

[MarkItDown](https://github.com/microsoft/markitdown) is Microsoft's Python tool for turning documents into Markdown. Some in-browser converters run it through Pyodide. Silar chose lightweight JavaScript libraries instead (see [decision 0000](decisions/0000-namn-stack-och-design.md)). This page shows how the two compare on Silar's test documents.

Run on 2026-11-08 with Silar 1.1.0 and MarkItDown 0.1.9.

## Summary

- **Checks passed:** Silar 56 of 56, MarkItDown 35 of 56. About 3 of MarkItDown's misses are only style (`*` bullets, another heading level). The rest are lost content or structure.
- **Biggest difference:** spreadsheets. MarkItDown includes hidden sheets, rows and columns, shows raw numbers, and breaks Swedish semicolon CSV files.
- **Speed:** Silar was 3 to 25 times faster on every document except scanned PDFs. Both finish each test file in well under a second.
- **Size of the output:** about the same, so token use is similar. The difference is structure, not length.
- **Download:** Silar's first page load is about 84 kB gzipped, and each format's reader (22 to 161 kB) loads when first needed. MarkItDown in a browser first needs the Python runtime, which is several megabytes.
- **Formats:** MarkItDown reads more formats (HTML, EPUB, images, audio, ZIP and more). Silar reads Word, Excel, CSV, PowerPoint and PDF.

## Results per document

Times are the median of three runs after a warm-up, on a Mac: Silar's `convert()` in Node, MarkItDown in CPython.

| Document | Silar | MarkItDown | Difference |
|---|---|---|---|
| Word, minutes with table | 6/6, 36 ms | 4/6, 93 ms | MarkItDown drops the title heading and gives the table an empty header row |
| Word, offer with nested list | 4/4, 26 ms | 2/4, 175 ms | Nested list flattened |
| Word, nested list styles | 3/3, 27 ms | 1/3, 91 ms | Word's "List Number 2" sublists lose their nesting |
| Word, links | 2/2, 32 ms | 1/2, 93 ms | Style only |
| Excel, budget with several sheets | 4/4, 2 ms | 4/4, 18 ms | Same |
| Excel, dates and percentages | 5/5, 1 ms | 2/5, 8 ms | `0.125` and `1234.5` instead of `12,5%` and `1 234,50` |
| Excel, hidden sheet, row and column | 9/9, 1 ms | 1/9, 8 ms | Hidden salaries sheet, hidden row and hidden personal ID column all included |
| CSV, Swedish Excel export | 3/3, 0.1 ms | 2/3, 5 ms | Semicolon not detected, table broken |
| PowerPoint, slides and notes | 5/5, 2 ms | 5/5, 11 ms | Same |
| PDF, report with page headers | 5/5, 9 ms | 4/5, 236 ms | Running header repeated on every page |
| PDF, table | 3/3, 4 ms | 3/3, 16 ms | Same |
| PDF, two columns | 4/4, 4 ms | 3/4, 61 ms | No headings, broken lines, column headings out of place |
| PDF, scanned | 1/1, 35 ms | 1/1, 6 ms | Both empty; only Silar explains why |
| PDF, partly scanned | 2/2, 41 ms | 2/2, 34 ms | Only Silar warns about the scanned page |

## Examples

A workbook with a hidden sheet called "Löner" and a hidden personal ID column. Silar leaves hidden parts out, because someone hid them on purpose:

```
## Deltagare

| Namn | Ort |
| --- | --- |
| Åsa Lindqvist | Lerum |
| Jörgen Öberg | Floda |
```

MarkItDown sends everything on to the AI chat:

```
## Deltagare
| Namn | Personnummer | Ort |
| --- | --- | --- |
| Åsa Lindqvist | 19800101-0000 | Lerum |
| Dold Rad | 19900101-0000 | Alingsås |
| Jörgen Öberg | 19700101-0000 | Floda |

## Löner
| Namn | Månadslön |
| --- | --- |
| Åsa Lindqvist | 41000 |
```

A CSV file exported by Swedish Excel, with semicolons and decimal commas. Silar:

```
| Artikel | Antal | Pris | Kommentar |
| --- | --- | --- | --- |
| Flytväst barn | 12 | 449,50 | Färg: röd |
```

MarkItDown:

```
| Artikel;Antal;Pris;Kommentar |  |
| --- | --- |
| Flytväst barn;12;449 | 50;Färg: röd |
```

## Limits of this comparison

- **The checks favour Silar.** They come from [`tests/fixtures/checks.json`](../tests/fixtures/checks.json), written while building Silar. Whitespace was normalised before scoring, but other style choices still count as misses.
- **Synthetic documents.** The 14 files are generated test documents (`tests/fixtures/generate.py`), not real-world files.
- **Not run in a browser.** MarkItDown ran in regular Python, not in Pyodide, where it is slower and needs its runtime downloaded first. Silar ran in Node, not in a browser worker.
- **One machine, one run.** The times show the order of magnitude, not a benchmark.

## How to run it again

1. Install MarkItDown in a separate Python environment: `python3 -m venv mid && mid/bin/pip install 'markitdown[docx,xlsx,pptx,pdf]'`.
2. Convert each file in `tests/fixtures/` with `MarkItDown().convert(path).text_content`, and with Silar's `convert()` (as `scripts/show.ts` does).
3. Apply the `must_contain`, `must_not_contain`, `must_not_contain_repeated` and `order` checks from `checks.json` to both outputs, after collapsing runs of spaces.
