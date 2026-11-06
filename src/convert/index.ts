import type { ConvertInput, ConvertResult } from "./types.ts";

export type { ConvertInput, ConvertResult, Warning, WarningCode } from "./types.ts";

// shortcut: stub until Phase 1 adds detection and the format parsers.
export async function convert(_file: ConvertInput): Promise<ConvertResult> {
  return { markdown: "", warnings: [], meta: { format: "unknown" } };
}
