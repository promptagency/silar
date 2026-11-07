// Format detection: extension first, checked against the file's first bytes.
// A mismatch or unknown extension falls back to the bytes: %PDF anywhere in
// the first kilobyte (as Acrobat accepts), or a zip whose main part names it.
export type Format = "docx" | "xlsx" | "pptx" | "csv" | "pdf";
export type Detected = { format: Format } | { format: null; legacy?: string };

const ZIP_MAIN: Record<string, Format> = {
  "word/document.xml": "docx",
  "xl/workbook.xml": "xlsx",
  "ppt/presentation.xml": "pptx",
};
const EXT: Record<string, Format> = { docx: "docx", xlsx: "xlsx", pptx: "pptx", csv: "csv", pdf: "pdf" };
const LEGACY = new Set(["doc", "xls", "ppt"]);

const isZip = (b: Uint8Array) => b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04;
export const isPdf = (b: Uint8Array) => new TextDecoder("latin1").decode(b.subarray(0, 1024)).includes("%PDF-");

async function zipFormat(bytes: Uint8Array): Promise<Format | null> {
  const { unzipSync } = await import("fflate");
  let found: Format | null = null;
  try {
    // The filter sees every entry name and inflates none of them.
    unzipSync(bytes, { filter: (f) => ((found ??= ZIP_MAIN[f.name] ?? null), false) });
  } catch {
    return null;
  }
  return found;
}

export async function detect(name: string, bytes: Uint8Array): Promise<Detected> {
  const ext = /\.([a-z0-9]+)$/i.exec(name)?.[1]?.toLowerCase() ?? "";
  const byExt = Object.hasOwn(EXT, ext) ? EXT[ext] : undefined;
  if (byExt === "csv") return { format: "csv" };
  if (byExt === "pdf" && isPdf(bytes)) return { format: "pdf" };
  if (byExt && byExt !== "pdf" && isZip(bytes) && (await zipFormat(bytes)) === byExt) return { format: byExt };
  if (isPdf(bytes)) return { format: "pdf" };
  if (isZip(bytes)) {
    const format = await zipFormat(bytes);
    if (format) return { format };
  }
  return { format: null, legacy: LEGACY.has(ext) ? ext : undefined };
}
