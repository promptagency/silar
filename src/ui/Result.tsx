import { useEffect, useRef, useState } from "react";
import type { ConvertResult } from "../convert/types.ts";
import { CheckIcon, ShareIcon, WarningIcon } from "./icons.tsx";
import { approxTokens, extent, markdownName, notices, num } from "./text.ts";

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
  const { markdown } = result;
  const fileName = markdownName(name);
  const facts = [name, extent(result.meta), `${num(markdown.length)} tecken`, `cirka ${num(approxTokens(markdown.length))} tokens`].filter(Boolean);

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
            </div>
          </div>
          <div className="result-actions">
            <button type="button" className="button primary desktop-only" onClick={copyText} disabled={!markdown}>
              {copyLabel}
            </button>
            <button type="button" className="button outline desktop-only" onClick={() => download(fileName, markdown)} disabled={!markdown}>
              Ladda ned .md
            </button>
            <button type="button" className="text-button" onClick={onAgain}>
              Sila en till
            </button>
          </div>
        </div>
        <span className="visually-hidden" aria-live="polite">
          {copy === "done" ? "Kopierat." : ""}
        </span>
        {markdown ? (
          <pre className="markdown" tabIndex={0} aria-label="Resultat i Markdown">
            {markdown}
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
