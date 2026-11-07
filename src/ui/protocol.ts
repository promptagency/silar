import type { ConvertResult } from "../convert/types.ts";

/** Page → worker: the file, transferred. */
export type ToWorker = { name: string; data: ArrayBuffer };
/** Worker → page. */
export type FromWorker = { type: "result"; result: ConvertResult } | { type: "error" };
