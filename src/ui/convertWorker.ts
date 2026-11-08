// Web Worker: converts one file. The page starts a fresh worker per file and
// ends it when the result arrives or on timeout, so nothing from the file
// outlives the conversion. Nothing here touches the network.
import pdfWorkerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";
import { isPdf } from "../convert/detect.ts";
import { convert } from "../convert/index.ts";
import type { FromWorker, ToWorker } from "./protocol.ts";

const post = (msg: FromWorker) => postMessage(msg);

self.onmessage = async (e: MessageEvent<ToWorker>) => {
  const { name, data } = e.data;
  try {
    // pdf.js runs its parser in a worker of its own, nested in this one:
    // imported straight into a worker, pdf.js takes over its messages.
    // The same %PDF- check detect() uses; convert() then picks the parser.
    if (isPdf(new Uint8Array(data))) {
      const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
      pdfjs.GlobalWorkerOptions.workerPort ??= new Worker(pdfWorkerUrl, { type: "module" });
    }
    post({ type: "result", result: await convert({ name, data }) });
  } catch {
    post({ type: "error" });
  }
};
