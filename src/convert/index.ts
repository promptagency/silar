// convert(file) -> { markdown, warnings, meta }. Each parser is loaded with
// import() the first time a file of its format comes in.
import { detect, type Format } from "./detect.ts";
import type { ConvertInput, ConvertResult, Warning } from "./types.ts";

export type { ConvertInput, ConvertResult, Warning, WarningCode } from "./types.ts";

const LARGE_FILE_BYTES = 25 * 1024 * 1024;

const PARSERS: Record<Format, () => Promise<(bytes: Uint8Array) => Promise<ConvertResult>>> = {
  docx: () => import("./docx.ts").then((m) => m.convertDocx),
  xlsx: () => import("./xlsx.ts").then((m) => m.convertXlsx),
  csv: () => import("./csv.ts").then((m) => m.convertCsv),
  pdf: () => import("./pdf/index.ts").then((m) => m.convertPdf),
  // shortcut: empty output until pptx (Phase 4) exists.
  pptx: async () => async () => ({ markdown: "", warnings: [], meta: { format: "pptx" } }),
};

function unsupported(legacy?: string): ConvertResult {
  const message = legacy
    ? `Det äldre formatet .${legacy} stöds inte. Spara filen som .${legacy}x och försök igen.`
    : "Filformatet stöds inte. Silar läser Word (.docx), Excel (.xlsx), CSV, PowerPoint (.pptx) och PDF.";
  return { markdown: "", warnings: [{ code: "unsupported_format", message }], meta: { format: "unknown" } };
}

export async function convert(file: ConvertInput): Promise<ConvertResult> {
  const data = "data" in file ? file.data : await file.arrayBuffer();
  const bytes = new Uint8Array(data);
  const found = await detect(file.name, bytes);
  if (!found.format) return unsupported(found.legacy);
  const warnings: Warning[] =
    bytes.length > LARGE_FILE_BYTES ? [{ code: "large_file", message: "Filen är större än 25 MB. Det kan ta en stund." }] : [];
  const result = await (await PARSERS[found.format]())(bytes);
  return { ...result, warnings: [...warnings, ...result.warnings] };
}
