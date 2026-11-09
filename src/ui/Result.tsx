import { useEffect, useRef, useState } from "react";
import type { ConvertResult } from "../convert/types.ts";
import { CheckIcon, ShareIcon, WarningIcon } from "./icons.tsx";
import { approxTokens, extent, markdownName, notices, num, pdfTokens } from "./text.ts";

// Far more than anyone reads on screen; laying out tens of millions of characters freezes the page.
const PREVIEW_CHARS = 200_000;

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/markdown;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Web Share with the .md file where the browser can, otherwise a download. */
async function shareOrSave(name: string, text: string) {
  const file = new File([text], name, { type: "text/markdown" });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
    } catch {
      /* the user closed the share sheet */
    }
  } else download(name, text);
}

export function Result({ name, result, onAgain }: { name: string; result: ConvertResult; onAgain: () => void }) {
  const [copy, setCopy] = useState<"idle" | "done" | "failed">("idle");
  const heading = useRef<HTMLHeadingElement>(null);
  const { markdown, meta } = result;
  const fileName = markdownName(name);
  const asText = approxTokens(markdown.length);
  const asPdf = meta.format === "pdf" && meta.pages ? pdfTokens(markdown.length, meta.pages) : null;
  const facts = [name, extent(meta), `${num(markdown.length)} tecken`, asPdf === null && `cirka ${num(asText)} tokens`].filter(Boolean);

  useEffect(() => heading.current?.focus(), []);
  useEffect(() => {
    if (copy === "idle") return;
    const t = setTimeout(() => setCopy("idle"), 2000);
    return () => clearTimeout(t);
  }, [copy]);

  const copyText = () =>
    navigator.clipboard.writeText(markdown).then(
      () => setCopy("done"),
      () => setCopy("failed"),
    );
  const copyLabel = copy === "done" ? "Kopierat." : copy === "failed" ? "Gick inte att kopiera" : "Kopiera";

  return (
    <div className="result-wrap">
      {notices(result.warnings).map((n) => (
        <div key={n.code} className="notice" role="note">
          <WarningIcon />
          <div>
            <p className="notice-title">{n.title}</p>
            <p>{n.message}</p>
          </div>
        </div>
      ))}

      <section className="result" aria-labelledby="result-title">
        <div className="result-head">
          <div className="result-title">
            <CheckIcon />
            <div>
              <h2 id="result-title" ref={heading} tabIndex={-1}>
                Silat.
              </h2>
              <p className="result-facts">{facts.join(" · ")}</p>
              {markdown.length > PREVIEW_CHARS && <p className="result-facts">Visar de första {num(PREVIEW_CHARS)} tecknen. Kopiera eller spara får med allt.</p>}
            </div>
          </div>
          <div className="result-actions">
            <button type="button" className="button primary desktop-only" onClick={copyText} disabled={!markdown}>
              {copyLabel}
            </button>
            <button type="button" className="button outline desktop-only" onClick={() => download(fileName, markdown)} disabled={!markdown}>
              Ladda ned .md
            </button>
            {/* Desktop keeps the upload next to the result; phones need a way back. */}
            <button type="button" className="text-button phone-only" onClick={onAgain}>
              Sila en till
            </button>
          </div>
        </div>
        {asPdf !== null && (
          <dl className="savings">
            <div>
              <dt>Som PDF i en AI-chatt</dt>
              <dd>
                {num(asPdf)} <span>tokens, ungefär</span>
              </dd>
            </div>
            <div>
              <dt>Som text</dt>
              <dd>
                {num(asText)} <span>tokens, ungefär</span>
              </dd>
            </div>
            <div className="saved">
              <dt>Du sparar</dt>
              <dd>
                {num(asPdf - asText)} <span>tokens, ungefär {Math.round((1 - asText / asPdf) * 100)} %</span>
              </dd>
            </div>
          </dl>
        )}
        <span className="visually-hidden" aria-live="polite">
          {copy === "idle" ? "" : copyLabel}
        </span>
        {markdown ? (
          // Scrollable, so it must take focus for keyboard scrolling (WCAG 2.1.1).
          // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex
          <pre className="markdown" tabIndex={0} aria-label="Resultat i Markdown">
            {markdown.slice(0, PREVIEW_CHARS)}
          </pre>
        ) : (
          <p className="markdown empty">Filen innehöll ingen text att sila.</p>
        )}
      </section>

      <div className="phone-bar phone-only">
        <button type="button" className="button primary" onClick={copyText} disabled={!markdown}>
          {copyLabel}
        </button>
        <button type="button" className="button outline icon" onClick={() => void shareOrSave(fileName, markdown)} disabled={!markdown} aria-label="Dela eller spara som .md">
          <ShareIcon />
        </button>
      </div>
    </div>
  );
}
