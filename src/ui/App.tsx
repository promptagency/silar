import { useEffect, useRef, useState } from "react";
import type { ConvertResult } from "../convert/types.ts";
import { convertFile } from "./convertFile.ts";
import { FileIcon, LockIcon, WarningIcon } from "./icons.tsx";
import { Result } from "./Result.tsx";
import { formatName, notices } from "./text.ts";

const ACCEPT = ".docx,.xlsx,.csv,.pptx,.pdf";
const LARGE_FILE_BYTES = 25 * 1024 * 1024;

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
  const busy = state.kind === "working";

  async function handle(file: File | undefined) {
    if (!file || busy) return;
    const format = formatName(file.name);
    setState({ kind: "working", name: file.name, reader: format && !loadedFormats.has(format) ? format : null, large: file.size > LARGE_FILE_BYTES });
    abort.current = new AbortController();
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
    setState({ kind: "idle" });
    if (input.current) input.current.value = "";
    requestAnimationFrame(() => document.getElementById("choose")?.focus());
  }

  // Esc cancels a conversion, same as Avbryt.
  useEffect(() => {
    if (!busy) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") abort.current?.abort();
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
  });

  return (
    <>
      <header className="site-header">
        <div className="wrap header-row">
          <a href="/" className="logo-link" aria-label="Silar, till startsidan">
            <img src="/brand/silar-logo.svg" alt="" className="logo" />
          </a>
          <nav aria-label="Huvudmeny">
            <a href="#sa-funkar-det">Så funkar det</a>
            <a href="#format">Format</a>
          </nav>
        </div>
      </header>

      <main>
        <section className="wrap hero" aria-labelledby="hero-title">
          <h1 id="hero-title">Silar fram texten. Resten stannar kvar.</h1>
          <p className="sub">Från dokument till AI-redo text, utan att filen lämnar datorn.</p>

          <input ref={input} type="file" accept={ACCEPT} hidden onChange={(e) => void handle(e.target.files?.[0])} />

          {state.kind === "idle" && (
            <div className="dropzone">
              <FileIcon />
              <p className="dropzone-text">Dra hit ett dokument</p>
              <p className="dropzone-or">eller</p>
              <button id="choose" type="button" className="button primary" onClick={() => input.current?.click()}>
                <span className="desktop-only">Välj fil</span>
                <span className="phone-only">Välj dokument</span>
              </button>
              <p className="dropzone-formats">Word, Excel, CSV, PowerPoint eller PDF</p>
            </div>
          )}

          {state.kind === "working" && (
            <div className="panel working" role="status" aria-live="polite">
              <FileIcon />
              <p className="working-name">{state.name}</p>
              <p className="working-status">{state.reader ? `Hämtar läsaren för ${state.reader} …` : "Silar …"}</p>
              {state.reader && <p className="working-note">Första gången tar det en stund. Sedan finns läsaren kvar i webbläsaren.</p>}
              {state.large && <p className="working-note">Stor fil, det kan ta en stund.</p>}
              <div className="progress" aria-hidden="true">
                <span />
              </div>
              <button type="button" className="button outline cancel" onClick={() => abort.current?.abort()}>
                Avbryt
              </button>
            </div>
          )}

          {state.kind === "done" && <Outcome name={state.name} result={state.result} onAgain={again} />}

          {state.kind === "failed" && <Blocked title="Något gick fel" message={state.message} onAgain={again} />}

          <p className="privacy">
            <LockIcon />
            Filen lämnar aldrig din dator. Allt sker här i webbläsaren.
          </p>
        </section>

        <section className="wrap" id="sa-funkar-det" aria-labelledby="steps-title">
          <h2 id="steps-title">Så funkar det</h2>
          <ol className="steps">
            <li>
              <h3>Välj ett dokument</h3>
              <p>Word, Excel, CSV, PowerPoint eller PDF. En fil i taget.</p>
            </li>
            <li>
              <h3>Silar plockar fram texten</h3>
              <p>Rubriker, listor och tabeller blir Markdown. Layout, bilder och metadata stannar kvar.</p>
            </li>
            <li>
              <h3>Klistra in i chatten</h3>
              <p>Kopiera resultatet och klistra in det i den AI-tjänst du använder.</p>
            </li>
          </ol>
        </section>

        <section className="wrap" aria-labelledby="compare-title">
          <h2 id="compare-title">Varför sila först?</h2>
          <div className="compare">
            <div className="compare-card">
              <h3>Ladda upp filen i chatten</h3>
              <ul>
                <li>Hela filen skickas, med metadata, bilder och dolda delar.</li>
                <li>Tjänsten tolkar layouten på sitt eget sätt.</li>
                <li>Du ser inte vad som faktiskt följer med.</li>
              </ul>
            </div>
            <div className="compare-card chosen">
              <h3>Sila först</h3>
              <ul>
                <li>Filen stannar på din dator.</li>
                <li>Du ser exakt vilken text som skickas och kan stryka det som inte ska med.</li>
                <li>Ren text tar mindre plats i chatten.</li>
              </ul>
            </div>
          </div>
        </section>

        <section className="wrap" id="format" aria-labelledby="format-title">
          <h2 id="format-title">Format</h2>
          <ul className="formats">
            <li>
              <h3>Word</h3>
              <p className="ext">.docx</p>
              <p>Rubriker, listor, tabeller och länkar.</p>
            </li>
            <li>
              <h3>Excel</h3>
              <p className="ext">.xlsx</p>
              <p>En tabell per flik. Datum och procent som i Excel.</p>
            </li>
            <li>
              <h3>CSV</h3>
              <p className="ext">.csv</p>
              <p>Även svenska Excel-exporter med semikolon.</p>
            </li>
            <li>
              <h3>PowerPoint</h3>
              <p className="ext">.pptx</p>
              <p>En rubrik per bild, punktlistor och talaranteckningar.</p>
            </li>
            <li>
              <h3>PDF</h3>
              <p className="ext">.pdf</p>
              <p>Text, rubriker och enkla tabeller. Inskannade sidor går inte att läsa.</p>
            </li>
          </ul>
        </section>
      </main>

      <footer className="site-footer">
        <div className="wrap">
          Ett verktyg från <a href="https://promptagency.se">Prompt Agency</a>
        </div>
      </footer>

      {dragging && (
        <div className="drag-overlay" aria-hidden="true">
          <p>Släpp för att sila</p>
        </div>
      )}
    </>
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
