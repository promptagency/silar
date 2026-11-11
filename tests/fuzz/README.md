# Fuzz corpus

`cases.ts` exports `fuzzCases()`, a list of about 150 broken, hostile or extreme input files for `convert()`. Each case has a stable kebab-case `id`, the file `name` passed to `convert()` (the extension matters for detection), the bytes and a one-line `note` saying what a good converter should do.

## How cases are built

Everything is generated in memory on each call, with no binary files committed:

- Mutations of the fixtures in `tests/fixtures/` (truncation, byte flips, flips inside the zip central directory or the PDF xref/trailer, renamed extensions).
- Office files rebuilt from fixture parts with a small zip writer (missing parts, malformed XML, entity expansion, deep nesting, 500 slides, 100 000 rows, 10 000 zip entries).
- Zip bombs and a PDF FlateDecode bomb, written as hand-encoded deflate streams with correct CRC-32/Adler-32, so ~500 MB of content takes a few MB on disk and is never held in memory while building.
- Hand-built PDFs (broken xref, zero pages, circular page trees, encryption dictionaries, a stream cut mid-way) and a minimal OLE/CFB container standing in for password-protected Office files.
- CSV edge cases (NUL bytes, UTF-16 with and without BOM, mixed line endings, unbalanced quotes, 5 000 columns, a 26 MB file).

Randomness comes from a seeded mulberry32 PRNG with fixed seeds, so the output is byte-identical on every run. Building the whole corpus takes about 3 s and about 70 MB.

## Contract

For every case, `convert()` must:

- resolve, never throw, within 10 s;
- only use warning codes from `no_text_layer`, `page_without_text`, `unsupported_format`, `formula_without_value`, `encoding_fallback`, `large_file`, `corrupt_file`;
- return at least one warning when `markdown` is empty;
- give warning messages that are non-empty Swedish text, with no stack traces or raw English exception text;
- keep `markdown` under 50 000 000 characters.

## Locked exam

The corpus is a locked exam. Fix failures in `src/`, never by changing or removing cases in `tests/fuzz/`.
