// Reading text files: decoding and the binary check, shared by csv and the plain text formats.
import type { ConvertResult, Warning } from "./types.ts";

export function decode(bytes: Uint8Array): { text: string; fallback: boolean } {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return { text: new TextDecoder().decode(bytes.subarray(3)), fallback: false };
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return { text: new TextDecoder("utf-16le").decode(bytes.subarray(2)), fallback: false };
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return { text: new TextDecoder("utf-16be").decode(bytes.subarray(2)), fallback: false };
  const utf16 = utf16Order(bytes);
  if (utf16) return { text: new TextDecoder(utf16).decode(bytes), fallback: false };
  try {
    return { text: new TextDecoder("utf-8", { fatal: true }).decode(bytes), fallback: false };
  } catch {
    return { text: new TextDecoder("windows-1252").decode(bytes), fallback: true };
  }
}

/**
 * UTF-16 without a byte order mark: plain Latin text then has a zero byte in
 * every other position, on the odd side for little-endian, even for big-endian.
 */
function utf16Order(bytes: Uint8Array): "utf-16le" | "utf-16be" | null {
  const n = Math.min(bytes.length, 4096) & ~1;
  if (n < 4) return null;
  let evenZero = 0;
  let oddZero = 0;
  for (let i = 0; i < n; i += 2) {
    if (bytes[i] === 0) evenZero++;
    if (bytes[i + 1] === 0) oddZero++;
  }
  const pairs = n / 2;
  if (oddZero > pairs * 0.6 && evenZero < pairs * 0.1) return "utf-16le";
  if (evenZero > pairs * 0.6 && oddZero < pairs * 0.1) return "utf-16be";
  return null;
}

// Control characters other than tab and line breaks: never text a person wrote.
// oxlint-disable-next-line no-control-regex -- matching control characters is the point
export const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;

/** A file that is mostly control characters is binary, not text with odd bytes in it. Trailing NUL padding does not count. */
export function isBinary(text: string): boolean {
  const head = text.replace(/\0+$/, "").slice(0, 64 * 1024);
  const controls = head.match(CONTROL)?.length ?? 0;
  return head.length === 0 ? text.length > 0 : controls > head.length * 0.1;
}

export const ENCODING_WARNING: Warning = { code: "encoding_fallback", message: "Filen använder en äldre teckenkodning. Kontrollera att å, ä och ö ser rätt ut." };

const tidy = (s: string) => s.replace(/\r\n?/g, "\n").replace(/[ \t]+$/gm, "").replace(/\n{3,}/g, "\n\n").trim();

/** txt and md: the text as it is, cleaned up. Markdown needs no conversion. */
export async function convertText(bytes: Uint8Array, format: "txt" | "md"): Promise<ConvertResult> {
  const { text, fallback } = decode(bytes);
  if (isBinary(text))
    return { markdown: "", warnings: [{ code: "corrupt_file", message: "Filen ser inte ut som en textfil utan innehåller binära data. Kontrollera att det är rätt fil och försök igen." }], meta: { format } };
  return { markdown: tidy(text.replace(CONTROL, "")), warnings: fallback ? [ENCODING_WARNING] : [], meta: { format } };
}
