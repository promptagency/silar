import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { type ConvertResult, LARGE_FILE_BYTES } from "../convert/types.ts";
import { convertFile } from "./convertFile.ts";
import { HowItWorks } from "./HowItWorks.tsx";
import { FileIcon, LockIcon, WarningIcon } from "./icons.tsx";
import { Result } from "./Result.tsx";
import { approxTokens, formatName, notices, num } from "./text.ts";

declare const __APP_VERSION__: string;

const ACCEPT = ".docx,.xlsx,.csv,.pptx,.pdf";

type State =
  | { kind: "idle" }
  | { kind: "working"; name: string; reader: string | null; large: boolean }
  | { kind: "done"; name: string; result: ConvertResult }
  | { kind: "failed"; message: string };

// Formats whose parser has been loaded in this page load, for the "first time" text.
const loadedFormats = new Set<string>();

export function App() {
  const [state, setState] = useState<State>({ kind: "idle" });
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const abort = useRef<AbortController | null>(null);
  const howItWorks = useRef<HTMLDialogElement>(null);
  const busy = state.kind === "working";

  // Busy check on the ref, not state: it is set at once, and keeps handle()
  // correct when called from the drop listener below, which is attached once.
  async function handle(file: File | undefined) {
    if (!file || abort.current) return;
    // The upload stays on screen next to a result: clear it so the same file can be picked again.
    if (input.current) input.current.value = "";
    const format = formatName(file.name);
    abort.current = new AbortController();
    setState({ kind: "working", name: file.name, reader: format && !loadedFormats.has(format) ? format : null, large: file.size > LARGE_FILE_BYTES });
    const outcome = await convertFile(file, abort.current.signal);
    abort.current = null;
    if (outcome.kind === "cancelled") return again();
    if (outcome.kind === "error") {
      const message =
        outcome.reason === "timeout"
          ? "Det tog för lång tid att läsa filen. Prova att dela upp den i mindre delar."
          : "Filen gick inte att läsa. Den kan vara skadad eller lösenordsskyddad. Prova att spara om den och försök igen.";
      setState({ kind: "failed", message });
      return;
    }
    if (format) loadedFormats.add(format);
    setState({ kind: "done", name: file.name, result: outcome.result });
  }

  function again() {
    // Rendered at once: "Välj fil" is disabled while busy and must be enabled before it can take focus.
    flushSync(() => setState({ kind: "idle" }));
    if (input.current) input.current.value = "";
    document.getElementById("choose")?.focus();
  }

  // Esc cancels a conversion, same as Avbryt; with "Så funkar det" open, Esc only closes that.
  useEffect(() => {
    if (!busy) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !howItWorks.current?.open) abort.current?.abort();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy]);

  // A file can be dropped anywhere on the page.
  useEffect(() => {
    let depth = 0;
    const hasFiles = (e: DragEvent) => e.dataTransfer?.types.includes("Files") ?? false;
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth++;
      setDragging(true);
    };
    const leave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setDragging(false);
    };
    const over = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault();
    };
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setDragging(false);
      void handle(e.dataTransfer?.files[0]);
    };
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragleave", leave);
    window.addEventListener("dragover", over);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("dragover", over);
      window.removeEventListener("drop", drop);
    };
  }, []);

  return (
    <>
      <header className="site-header">
        <div className="wrap header-row">
          <a href="/" className="logo-link" aria-label="Silar, till startsidan">
            <img src="/brand/silar-logo.svg" alt="" className="logo" />
          </a>
          <nav aria-label="Huvudmeny">
            <button type="button" aria-haspopup="dialog" onClick={() => howItWorks.current?.showModal()}>
              Så funkar det
            </button>
          </nav>
        </div>
      </header>

      <main>
        <section className="wrap hero" aria-labelledby="hero-title">
          <h1 id="hero-title">Sila dina texter. Spara dina tokens.</h1>

          <input ref={input} type="file" accept={ACCEPT} hidden onChange={(e) => void handle(e.target.files?.[0])} />

          {/* Desktop: upload on the left at all times, example, progress or result on the right.
              Phone (CSS): one column, upload before a file and the result after it. */}
          <div className={`workspace ${state.kind}`}>
            <div className="intake">
              <div className="dropzone">
                <FileIcon />
                <p className="dropzone-text">Dra hit ett dokument</p>
                <p className="dropzone-or">eller</p>
                <button id="choose" type="button" className="button primary" onClick={() => input.current?.click()} disabled={busy}>
                  <span className="desktop-only">Välj fil</span>
                  <span className="phone-only">Välj dokument</span>
                </button>
                <p className="dropzone-formats">Word, Excel, CSV, PowerPoint eller PDF</p>
              </div>
            </div>

            <div className="output">
              {state.kind === "idle" && <Example />}

              {state.kind === "working" && (
                <div className="panel working" role="status" aria-live="polite">
                  <FileIcon />
                  <p className="working-name">{state.name}</p>
                  <p className="working-status">{state.reader ? `Hämtar läsaren för ${state.reader} …` : "Silar …"}</p>
                  {state.reader && <p className="working-note">Första gången kan det ta en stund. Sedan finns läsaren kvar i webbläsaren.</p>}
                  {state.large && <p className="working-note">Stor fil. Det kan ta en stund.</p>}
                  <div className="progress" aria-hidden="true">
                    <span />
                  </div>
                  {/* "Välj fil" was focused and is now disabled (or hidden on phones); keep keyboard users on a control. */}
                  {/* oxlint-disable-next-line jsx-a11y/no-autofocus */}
                  <button type="button" className="button outline cancel" onClick={() => abort.current?.abort()} autoFocus>
                    Avbryt
                  </button>
                </div>
              )}

              {state.kind === "done" && <Outcome name={state.name} result={state.result} onAgain={again} />}

              {state.kind === "failed" && <Blocked title="Det gick inte att sila filen" message={state.message} onAgain={again} />}
            </div>
          </div>

          <div className="privacy">
            <LockIcon />
            <div>
              <p>Filen lämnar aldrig din enhet. Allt sker här i webbläsaren.</p>
              <p className="formats-line">Läser Word (.docx), Excel (.xlsx), CSV, PowerPoint (.pptx) och PDF.</p>
            </div>
          </div>
        </section>

      </main>

      <footer className="site-footer">
        <div className="wrap">
          Ett verktyg från <a href="https://promptagency.se">Prompt Agency</a> · Version {__APP_VERSION__}
        </div>
      </footer>

      <HowItWorks ref={howItWorks} />

      {dragging && (
        <div className="drag-overlay" aria-hidden="true">
          <p>Släpp för att sila</p>
        </div>
      )}
    </>
  );
}

// Silar's real output for tests/fixtures/01-protokoll-styrelsemote.docx, up to the table.
const EXAMPLE = `# Protokoll styrelsemöte Lerums seglarklubb

Datum 2026-10-14, plats klubbhuset Aspen.

## 1. Närvarande

- Åsa Lindqvist, ordförande
- Jörgen Öberg, kassör
- Märta Ek, sekreterare

## 2. Ekonomi

Kassören redovisade att resultatet är **positivt med 42 300 kr** efter tredje kvartalet.

| Post | Budget | Utfall |
| --- | --- | --- |
| Medlemsavgifter | 120 000 | 118 500 |
| Bryggavgifter | 80 000 | 86 200 |
| Underhåll | -60 000 | -41 900 |`;

/** Before the first file: what a result looks like, in the panel the result will fill. */
function Example() {
  return (
    <section className="result example" aria-labelledby="example-title">
      <div className="result-head">
        <div className="result-title">
          <div>
            <h2 id="example-title">Exempel</h2>
            <p className="result-facts">
              protokoll.docx · {num(EXAMPLE.length)} tecken · cirka {num(approxTokens(EXAMPLE.length))} tokens
            </p>
          </div>
        </div>
        <p className="example-hint">Ditt resultat visas här.</p>
      </div>
      <pre className="markdown">{EXAMPLE}</pre>
    </section>
  );
}

/** A result, or a warning in its place when there is nothing to show. */
function Outcome({ name, result, onAgain }: { name: string; result: ConvertResult; onAgain: () => void }) {
  const blocking = notices(result.warnings).find((n) => n.code === "unsupported_format" || n.code === "no_text_layer");
  if (blocking) return <Blocked title={blocking.title} message={blocking.message} onAgain={onAgain} />;
  return <Result name={name} result={result} onAgain={onAgain} />;
}

function Blocked({ title, message, onAgain }: { title: string; message: string; onAgain: () => void }) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);
  return (
    <div className="notice blocked">
      <WarningIcon />
      <div>
        <h2 ref={heading} tabIndex={-1}>
          {title}
        </h2>
        <p>{message}</p>
        <button type="button" className="button primary" onClick={onAgain}>
          Välj en annan fil
        </button>
      </div>
    </div>
  );
}
