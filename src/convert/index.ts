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

function unsupported({ legacy, locked, opendocument }: { legacy?: string; locked?: true; opendocument?: true }): ConvertResult {
  const message = opendocument
    ? "Filen är sparad i OpenDocument-format (LibreOffice). Spara den som .docx, .xlsx eller .pptx och försök igen."
    : locked
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
    // Out of memory or a string past the engine's limit: the file is valid but too big for a browser tab.
    if (err instanceof RangeError) return broken(found.format, TOO_BIG);
    // Anything else is most likely a damaged file, but can be a bug or a reader that failed to load.
    return broken(found.format);
  }
  const all = [...warnings, ...result.warnings];
  if (result.markdown.trim() === "" && all.length === 0) all.push({ code: "no_text_layer", message: "Filen innehåller ingen text att sila." });
  return { ...result, warnings: all };
}

const APP: Record<Format, string> = { docx: "Word", xlsx: "Excel", pptx: "PowerPoint", csv: "ett kalkylprogram", pdf: "en PDF-läsare" };
const BOMB = "Filen blir för stor när den packas upp. Den kan vara skadad eller byggd för att överbelasta datorn, så Silar läser den inte.";
const TOO_BIG = "Filen är för stor för att läsas i webbläsaren. Prova att dela upp den i mindre delar.";

function broken(format: Format, message?: string): ConvertResult {
  return {
    markdown: "",
    warnings: [
      {
        code: "corrupt_file",
        message: message ?? `Silar kunde inte läsa filen, den kan vara skadad. Öppna den i ${APP[format]} och spara en ny kopia. Hjälper inte det, ladda om sidan och försök igen.`,
      },
    ],
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
