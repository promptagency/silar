// Format detection: extension first, checked against the file's first bytes.
// A mismatch or unknown extension falls back to the bytes: %PDF anywhere in
// the first kilobyte (as Acrobat accepts), or a zip whose main part names it.
export type Format = "docx" | "xlsx" | "ods" | "odt" | "odp" | "pptx" | "csv" | "pdf" | "txt" | "md" | "html";
export type Detected = { format: Format } | { format: null; legacy?: string; locked?: true; empty?: true; damaged?: Format; opendocument?: true };

const ZIP_MAIN: Record<string, Format> = {
  "word/document.xml": "docx",
  "xl/workbook.xml": "xlsx",
  "ppt/presentation.xml": "pptx",
};
const EXT: Record<string, Format> = { docx: "docx", xlsx: "xlsx", ods: "ods", odt: "odt", odp: "odp", pptx: "pptx", csv: "csv", pdf: "pdf", txt: "txt", md: "md", markdown: "md", html: "html", htm: "html" };
const TEXT = new Set<Format>(["csv", "txt", "md", "html"]);
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
    // hasOwn: an entry named "constructor" must not match Object.prototype.
    unzipSync(bytes, { filter: (f) => ((found ??= Object.hasOwn(ZIP_MAIN, f.name) ? ZIP_MAIN[f.name] : null), false) });
  } catch {
    return null;
  }
  return found;
}

const ODF_MIME: Record<string, Format> = {
  "application/vnd.oasis.opendocument.spreadsheet": "ods",
  "application/vnd.oasis.opendocument.text": "odt",
  "application/vnd.oasis.opendocument.presentation": "odp",
};

/** The zip's "mimetype" entry (a few dozen bytes; anything bigger is not one), or "". */
async function odfMime(bytes: Uint8Array): Promise<string> {
  const { unzipSync, strFromU8 } = await import("fflate");
  try {
    return strFromU8(unzipSync(bytes, { filter: (f) => f.name === "mimetype" && f.originalSize < 256 }).mimetype ?? new Uint8Array()).trim();
  } catch {
    return "";
  }
}

export async function detect(name: string, bytes: Uint8Array): Promise<Detected> {
  const ext = /\.([a-z0-9]+)$/i.exec(name)?.[1]?.toLowerCase() ?? "";
  const byExt = Object.hasOwn(EXT, ext) ? EXT[ext] : undefined;
  if (bytes.length === 0) return { format: null, empty: true };
  if (byExt && TEXT.has(byExt) && !isZip(bytes) && !isOle(bytes) && !isPdf(bytes)) return { format: byExt };
  if (byExt === "pdf" && isPdf(bytes)) return { format: "pdf" };
  const zipped = isZip(bytes) ? await zipFormat(bytes) : null;
  if (byExt && byExt !== "pdf" && zipped === byExt) return { format: byExt };
  if (isPdf(bytes)) return { format: "pdf" };
  if (zipped) return { format: zipped };
  // A zip named .docx/.xlsx/.pptx whose main part is missing or unreadable: damaged, not foreign.
  // OpenDocument (LibreOffice) is a zip too; its "mimetype" entry names the type.
  const odf = isZip(bytes) ? await odfMime(bytes) : "";
  if (Object.hasOwn(ODF_MIME, odf)) return { format: ODF_MIME[odf] };
  if (odf.startsWith("application/vnd.oasis.opendocument")) return { format: null, opendocument: true };
  // Only "PK" is checked: the signature's next bytes may be what got damaged.
  if (byExt && byExt !== "pdf" && !TEXT.has(byExt) && bytes[0] === 0x50 && bytes[1] === 0x4b) return { format: null, damaged: byExt };
  // Office saves a password-protected docx/xlsx/pptx inside an OLE file, not a zip.
  if (byExt && byExt !== "pdf" && isOle(bytes)) return { format: null, locked: true };
  return { format: null, legacy: LEGACY.has(ext) ? ext : undefined };
}
