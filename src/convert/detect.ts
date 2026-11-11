// Format detection: extension first, checked against the file's first bytes.
// A mismatch or unknown extension falls back to the bytes: %PDF anywhere in
// the first kilobyte (as Acrobat accepts), or a zip whose main part names it.
export type Format = "docx" | "xlsx" | "pptx" | "csv" | "pdf";
export type Detected = { format: Format } | { format: null; legacy?: string; locked?: true; empty?: true; damaged?: Format; opendocument?: true };

const ZIP_MAIN: Record<string, Format> = {
  "word/document.xml": "docx",
  "xl/workbook.xml": "xlsx",
  "ppt/presentation.xml": "pptx",
};
const EXT: Record<string, Format> = { docx: "docx", xlsx: "xlsx", pptx: "pptx", csv: "csv", pdf: "pdf" };
const LEGACY = new Set(["doc", "xls", "ppt"]);

const isZip = (b: Uint8Array) => b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04;
const isOle = (b: Uint8Array) => b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0;
export const isPdf = (b: Uint8Array) => new TextDecoder("latin1").decode(b.subarray(0, 1024)).includes("%PDF-");

// A zip that unpacks to more than this, at a ratio no real Office file has,
// is a zip bomb (or broken): reading it would freeze the tab or run it out of
// memory. Real files reach ratios of 10 to 30; bombs reach hundreds or more.
const BOMB_BYTES = 200 * 1024 * 1024;
const BOMB_RATIO = 100;
const MAX_UNZIPPED = 1024 * 1024 * 1024;

/** True if the zip's directory claims sizes no real document has. Inflates nothing. */
export async function zipBomb(bytes: Uint8Array): Promise<boolean> {
  const { unzipSync } = await import("fflate");
  let total = 0;
  try {
    unzipSync(bytes, { filter: (f) => ((total += f.originalSize), false) });
  } catch {
    return false;
  }
  return total > MAX_UNZIPPED || (total > BOMB_BYTES && total / bytes.length > BOMB_RATIO);
}

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
  if (bytes.length === 0) return { format: null, empty: true };
  if (byExt === "csv" && !isZip(bytes) && !isOle(bytes) && !isPdf(bytes)) return { format: "csv" };
  if (byExt === "pdf" && isPdf(bytes)) return { format: "pdf" };
  if (byExt && byExt !== "pdf" && isZip(bytes) && (await zipFormat(bytes)) === byExt) return { format: byExt };
  if (isPdf(bytes)) return { format: "pdf" };
  if (isZip(bytes)) {
    const format = await zipFormat(bytes);
    if (format) return { format };
  }
  // A zip named .docx/.xlsx/.pptx whose main part is missing or unreadable: damaged, not foreign.
  // OpenDocument (LibreOffice) is a zip too; its first entry names the type.
  if (bytes[0] === 0x50 && bytes[1] === 0x4b && new TextDecoder("latin1").decode(bytes.subarray(0, 256)).includes("application/vnd.oasis.opendocument")) return { format: null, opendocument: true };
  // Only "PK" is checked: the signature's next bytes may be what got damaged.
  if (byExt && byExt !== "pdf" && byExt !== "csv" && bytes[0] === 0x50 && bytes[1] === 0x4b) return { format: null, damaged: byExt };
  // Office saves a password-protected docx/xlsx/pptx inside an OLE file, not a zip.
  if (byExt && byExt !== "pdf" && isOle(bytes)) return { format: null, locked: true };
  return { format: null, legacy: LEGACY.has(ext) ? ext : undefined };
}
