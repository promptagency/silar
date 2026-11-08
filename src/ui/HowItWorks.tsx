import type { ReactNode, Ref } from "react";

const FAQ: [string, ReactNode][] = [
  [
    "Varför göra om filen till Markdown innan den går till AI-chatten?",
    "För att AI:n ska få innehållet, inte förpackningen. Laddar du upp filen gör tjänsten om den till text på sitt eget sätt: tabeller kan gå sönder, sidhuvuden upprepas, spalter blandas och layout och bilder tar plats. Markdown är ren text där rubriker, listor och tabeller behåller sin struktur, och AI-modeller läser det bra. Du ser exakt vad som skickas, kan stryka det som inte ska med och sparar tokens.",
  ],
  ["Skickas min fil någonstans?", "Nej. Silar läser filen i webbläsaren på din enhet. Filen, filnamnet och resultatet skickas aldrig till någon server."],
  [
    "Hur sparar Silar tokens?",
    "En AI-tjänst som får hela filen läser också layout, bilder och dold information. Silar ger den bara texten, rubrikerna och tabellerna. I resultatet ser du ungefär hur många tokens texten blir.",
  ],
  ["Vilka filer kan Silar läsa?", "Word (.docx), Excel (.xlsx), CSV, PowerPoint (.pptx) och PDF. Äldre .doc-, .xls- och .ppt-filer behöver sparas om i det nya formatet först."],
  ["Varför blir min PDF tom?", "Den är troligen inskannad, alltså bilder av text. Silar läser inte text i bilder. Kör textigenkänning (OCR) på filen först."],
  ["Vad är Markdown?", "Ett enkelt textformat. # betyder rubrik, - betyder punktlista och | bygger tabeller. AI-tjänster läser det bra."],
  ["Fungerar Silar utan internet?", "Ja, efter första besöket. Läsaren för varje filtyp sparas i webbläsaren första gången du öppnar en sådan fil."],
  [
    "Vilken teknik bygger Silar på?",
    <>
      Öppen källkod som körs i din webbläsare:
      <ul>
        <li>Word: mammoth och turndown</li>
        <li>Excel: SheetJS</li>
        <li>PowerPoint: fflate och fast-xml-parser</li>
        <li>PDF: pdf.js från Mozilla</li>
        <li>CSV: Silars egen kod</li>
        <li>Gränssnittet: React</li>
      </ul>
      Ingen programvara från Microsoft används. Word, Excel och PowerPoint sparar i ett öppet standardformat (Office Open XML) som biblioteken läser direkt.
    </>,
  ],
  [
    "Vad kostar det?",
    <>
      Inget. Silar är gratis och öppen källkod. Koden finns på <a href="https://github.com/promptagency/silar">GitHub</a>.
    </>,
  ],
  [
    "Samlar ni in något om mig?",
    "Bara anonyma sidvisningar, utan kakor, på vår egen server i Finland. Inget om dina filer. Ber din webbläsare om att inte spåras räknas du inte alls.",
  ],
];

/** "Så funkar det": the three steps and the FAQ, in a modal dialog opened from the header. */
export function HowItWorks({ ref }: { ref: Ref<HTMLDialogElement> }) {
  return (
    // A click on the backdrop lands on the dialog itself and closes it. Mouse only:
    // keyboard users have Esc (native to <dialog>) and the "Stäng" button.
    // oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions
    <dialog
      ref={ref}
      className="modal"
      aria-labelledby="how-title"
      onClick={(e) => e.target === e.currentTarget && e.currentTarget.close()}
    >
      <div className="modal-head">
        <h2 id="how-title">Så funkar det</h2>
        <button type="button" className="text-button" onClick={(e) => e.currentTarget.closest("dialog")?.close()}>
          Stäng
        </button>
      </div>
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
      <h3 className="faq-title">Vanliga frågor</h3>
      <div className="faq">
        {FAQ.map(([q, a]) => (
          // Same name: opening one closes the others (native exclusive accordion).
          <details key={q} name="faq">
            <summary>{q}</summary>
            <div className="faq-answer">{a}</div>
          </details>
        ))}
      </div>
    </dialog>
  );
}
