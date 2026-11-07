// Runs convert() for one file in a worker of its own (pattern from Skrubba).
import type { ConvertResult } from "../convert/types.ts";
import type { FromWorker, ToWorker } from "./protocol.ts";

const TIMEOUT_MS = 180_000;

export type Outcome = { kind: "result"; result: ConvertResult } | { kind: "error"; reason: "failed" | "timeout" } | { kind: "cancelled" };

/** Aborting `signal` stops the worker at once, mid-parse. */
export function convertFile(file: File, signal: AbortSignal): Promise<Outcome> {
  return new Promise((resolve) => {
    const worker = new Worker(new URL("./convertWorker.ts", import.meta.url), { type: "module" });
    let settled = false;
    const finish = (outcome: Outcome) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal.removeEventListener("abort", cancel);
      worker.terminate();
      resolve(outcome);
    };
    const cancel = () => finish({ kind: "cancelled" });
    signal.addEventListener("abort", cancel);
    const timer = setTimeout(() => finish({ kind: "error", reason: "timeout" }), TIMEOUT_MS);
    worker.onmessage = (e: MessageEvent<FromWorker>) =>
      finish(e.data.type === "result" ? { kind: "result", result: e.data.result } : { kind: "error", reason: "failed" });
    worker.onerror = () => finish({ kind: "error", reason: "failed" });
    file.arrayBuffer().then(
      (data) => {
        const msg: ToWorker = { name: file.name, data };
        worker.postMessage(msg, [data]);
      },
      () => finish({ kind: "error", reason: "failed" }),
    );
  });
}
