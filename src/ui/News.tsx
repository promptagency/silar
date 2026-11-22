import type { Ref } from "react";
import { NEWS } from "./news.ts";

const date = new Intl.DateTimeFormat("sv-SE", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

/** "Nyheter": what changed in the latest versions, in a modal dialog opened from the footer. */
export function News({ ref }: { ref: Ref<HTMLDialogElement> }) {
  return (
    // Same dialog as "Så funkar det": backdrop click closes it, keyboard users have Esc and "Stäng".
    // oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions
    <dialog ref={ref} className="modal" aria-labelledby="news-title" onClick={(e) => e.target === e.currentTarget && e.currentTarget.close()}>
      <div className="modal-head">
        <h2 id="news-title">Nyheter</h2>
        <button type="button" className="text-button" onClick={(e) => e.currentTarget.closest("dialog")?.close()}>
          Stäng
        </button>
      </div>
      {NEWS.map((n) => (
        <section key={n.version} className="news-entry">
          <h3>
            Version {n.version} · {date.format(new Date(n.date))}
          </h3>
          <ul>
            {n.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      ))}
    </dialog>
  );
}
