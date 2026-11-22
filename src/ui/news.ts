// What changed, for users, in Swedish. Newest first, keep the latest 5; add an entry with every release.
export const NEWS: { version: string; date: string; items: string[] }[] = [
  {
    version: "1.10.0",
    date: "2026-11-22",
    items: ["Silar läser nu textdokument (.odt) från LibreOffice Writer och presentationer (.odp) från LibreOffice Impress."],
  },
  {
    version: "1.9.0",
    date: "2026-11-22",
    items: ["Silar läser nu textfiler (.txt), Markdown (.md) och webbsidor sparade som .html.", "Webbsidor blir rubriker, listor, tabeller och länkar, utan skript och bilder."],
  },
  {
    version: "1.8.0",
    date: "2026-11-22",
    items: ["Silar läser nu OpenDocument-kalkylblad (.ods) från LibreOffice Calc.", "Klicka på versionsnumret längst ned på sidan för att se vad som är nytt."],
  },
  {
    version: "1.7.1",
    date: "2026-11-22",
    items: ["PowerPoint: ett trasigt SmartArt-diagram stoppar inte längre resten av presentationen.", "Word: filer med många bilder kräver mindre minne."],
  },
  {
    version: "1.7.0",
    date: "2026-11-11",
    items: [
      "Trasiga och tomma filer får ett tydligt meddelande om vad som är fel.",
      "Silar säger till när en PDF är lösenordsskyddad eller en fil är sparad i LibreOffice-format.",
      "Word: stora tabeller går mycket snabbare.",
      "Excel: vissa ovanliga kalkylblad får inte längre sidan att hänga sig.",
      "CSV: fler teckenkodningar läses rätt, så å, ä och ö ser rätt ut.",
    ],
  },
];
