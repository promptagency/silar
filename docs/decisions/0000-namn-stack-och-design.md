# 0000 Namn, stack och design
Datum: 2026-11-06
Status: beslutad

## Läge
Ett offlineverktyg som gör om dokument till markdown för AI-chattar. Det finns redan liknande verktyg som kör MarkItDown via Pyodide i webbläsaren, och flera tjänster som laddar upp filen till en server. Namn, teknikval och utseende behövde låsas innan bygget lämnas till Claude Code.

## Beslut
- Fristående produkt med namnet Silar på silar.app. Ingen koppling i kod till Skrubba. Integration i Skrubba är ett eget framtida projekt.
- Lättviktiga JS-parsers per format (mammoth och turndown, SheetJS, fflate med fast-xml-parser, pdf.js) som laddas först när de behövs. Inte MarkItDown via Pyodide.
- PDF ingår från start. Skannade sidor ger en varning i stället för OCR.
- Samma stack som Skrubba, React 19, Vite, vanlig CSS, PWA och Cloudflare Pages, så att konverteringen kan flyttas dit senare.
- Eget designprogram, se `docs/design.md`. Ordbild i Schibsted Grotesk 800 där i:ets prick är en droppe i Glöd, på en kall palett med Signalblått. Loggan används bara på ljus botten. Inget mörkt läge i första versionen.

## Alternativ som valdes bort
- MarkItDown via Pyodide. Trogen originalet men tung första nedladdning och svag PDF-hantering.
- Dokumentimport direkt i Skrubba. Silar ska först visa sitt värde på egen hand.
- Namnen Mangla, Vika, Sila och Silat. Mangla gav fel bild, Sila var upptaget och Silat krockar med en kampsport.
- Gemensamt designspråk med Skrubba och Norn.

## Följder
- PDF-kvaliteten är största risken och testas tidigt (fas 2 och 3 i PLAN.md), med ett stopp där Micke avgör om tabellhanteringen räcker.
- `src/convert/` måste gå att köra i både webbläsare och Node.
- Glöd är reserverad för droppen och får inte användas till knappar eller varningar.
