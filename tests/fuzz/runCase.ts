// Runs convert() on one fuzz case inside a worker thread, so the harness can
// kill a case that hangs or runs out of memory without taking Vitest down.
import { parentPort, workerData } from "node:worker_threads";
import { convert } from "../../src/convert/index.ts";

const { name, data } = workerData as { name: string; data: Uint8Array };
const started = performance.now();
try {
  const buf = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
  const result = await convert({ name, data: buf });
  parentPort!.postMessage({ kind: "result", ms: performance.now() - started, result });
} catch (err) {
  parentPort!.postMessage({ kind: "threw", ms: performance.now() - started, error: String((err as Error)?.stack ?? err) });
}
