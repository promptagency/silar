// convert(file) -> { markdown, warnings, meta }. Each parser is loaded with
// import() the first time a file of its format comes in.
import { detect, type Format, zipBomb } from "./detect.ts";
import { type ConvertInput, type ConvertResult, LARGE_FILE_BYTES, type Warning } from "./types.ts";

export type { ConvertInput, ConvertResult, Warning, WarningCode } from "./types.ts";


const PARSERS: Record<Format, () => Promise<(bytes: Uint8Array) => Promise<ConvertResult>>> = {
  docx: () => import("./docx.ts").then((m) => m.convertDocx),
  xlsx: () => import("./xlsx.ts").then((m) => m.convertXlsx),
  csv: () => import("./csv.ts").then((m) => m.convertCsv),
  pdf: () => import("./pdf/index.ts").then((m) => m.convertPdf),
  pptx: () => import("./pptx.ts").then((m) => m.convertPptx),
};

function unsupported({ legacy, locked }: { legacy?: string; locked?: true }): ConvertResult {
  const message = locked
    ? "Filen är lösenordsskyddad eller sparad i ett äldre format. Ta bort lösenordet i Office, spara om filen och försök igen."
    : legacy
      ? `Det äldre formatet .${legacy} stöds inte. Spara filen som .${legacy}x och försök igen.`
      : "Filformatet stöds inte. Silar läser Word (.docx), Excel (.xlsx), CSV, PowerPoint (.pptx) och PDF.";
  return { markdown: "", warnings: [{ code: "unsupported_format", message }], meta: { format: "unknown" } };
}

export async function convert(file: ConvertInput): Promise<ConvertResult> {
  const data = "data" in file ? file.data : await file.arrayBuffer();
  const bytes = new Uint8Array(data);
  const found = await detect(file.name, bytes);
  if (!found.format) {
    if (found.empty) return { markdown: "", warnings: [{ code: "corrupt_file", message: "Filen är tom. Kontrollera att den sparades ordentligt och försök igen." }], meta: { format: "unknown" } };
    if (found.damaged) return broken(found.damaged);
    return unsupported(found);
  }
  const warnings: Warning[] =
    bytes.length > LARGE_FILE_BYTES ? [{ code: "large_file", message: "Filen är större än 25 MB. Resultatet kan bli för långt för en del AI-chattar." }] : [];
  if (found.format !== "csv" && found.format !== "pdf" && (await zipBomb(bytes))) return broken(found.format, BOMB);
  const parse = await PARSERS[found.format]();
  let result: ConvertResult;
  try {
    result = await parse(bytes);
  } catch (err) {
    // A parser that throws means the file is damaged, or locked in a way
    // detect() could not see. Never pass the raw exception text on.
    if ((err as Error)?.name === "PasswordException") return locked();
    return broken(found.format);
  }
  const all = [...warnings, ...result.warnings];
  if (result.markdown.trim() === "" && all.length === 0) all.push({ code: "no_text_layer", message: "Filen innehåller ingen text att sila." });
  return { ...result, warnings: all };
}

const APP: Record<Format, string> = { docx: "Word", xlsx: "Excel", pptx: "PowerPoint", csv: "ett kalkylprogram", pdf: "en PDF-läsare" };
const BOMB = "Filen packas upp till långt mer än den väger och ser ut att vara skadad eller gjord för att överbelasta datorn. Silar läser den inte.";

function broken(format: Format, message?: string): ConvertResult {
  return {
    markdown: "",
    warnings: [{ code: "corrupt_file", message: message ?? `Filen verkar vara skadad och går inte att läsa. Öppna den i ${APP[format]}, spara en ny kopia och försök igen.` }],
    meta: { format },
  };
}

function locked(): ConvertResult {
  return {
    markdown: "",
    warnings: [{ code: "unsupported_format", message: "PDF:en är lösenordsskyddad. Ta bort lösenordet, spara filen och försök igen." }],
    meta: { format: "pdf" },
  };
}
