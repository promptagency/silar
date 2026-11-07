export type WarningCode =
  | "no_text_layer"
  | "page_without_text"
  | "unsupported_format"
  | "formula_without_value"
  | "encoding_fallback"
  | "large_file";

export interface Warning {
  code: WarningCode;
  message: string;
  page?: number;
}

export interface ConvertResult {
  markdown: string;
  warnings: Warning[];
  meta: { format: string; pages?: number; sheets?: string[] };
}

export type ConvertInput = File | { name: string; data: ArrayBuffer };

/** Above this size the UI says "Stor fil" and convert() adds a large_file warning. */
export const LARGE_FILE_BYTES = 25 * 1024 * 1024;
