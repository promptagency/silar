# Silar design program

Decided 2026-11-06. Source canvas: Claude Design "Silar – designprogram" (artboard "Silar · Raster med droppen").

## Idea
Silar strains documents: the text runs through, the layout stays behind. The wordmark shows it literally. The dot of the i has fallen into the letter as a drop. The base is cool and technical (the "Raster" direction); the drop is the only warm element.

## Wordmark
- Text: `sılar`, lower case, dotless ı (U+0131). Never a regular dotted i
- Typeface: Schibsted Grotesk 800, tracking −0.04 em, drawn as outlines (see `assets/`). Never set the logo as live text
- The drop: horizontally centred on the stem of the ı, its vertical centre on the stem's bottom edge (the baseline). Width = stem width × 1.17 × 1.25
- A gap separates drop and stem. In the asset files it is a mask cut, so the logo works on any background
- Drop is always Glöd, letters always Natt
- The logo is only placed on light grounds (Dager or white). No negative version. Where the logo would sit on Natt, leave it out (the dark result panel never carries the logo)
- Minimum size: 24 px tall (header uses 36 px on desktop, 28 px on phone). Below that, use the favicon

| File | Use |
|---|---|
| `assets/silar-logo.svg` | Light backgrounds |
| `assets/silar-logo-mono.svg` | One colour, inherits `currentColor` |
| `assets/favicon.svg` | Favicon, PWA icon, app icon (drop on Natt) |

## Colour
| Token | Name | Hex | Use |
|---|---|---|---|
| `--color-bg` | Dager | `#F6F7F9` | Page background |
| `--color-surface` | Vit | `#FFFFFF` | Cards, result panel on light theme |
| `--color-tint` | Nät | `#DCE4F7` | Hover, selected, drop zone active |
| `--color-accent` | Signal | `#1F4FD1` | Primary buttons, links, focus ring |
| `--color-ink` | Natt | `#0E1424` | Text, dark result panel |
| `--color-muted` | | `#5A6275` | Secondary text (passes 4.5:1 on Dager) |
| `--color-line` | | `#D5D9E2` | Borders, dividers |
| `--color-drop` | Glöd | `#E8661C` | The drop, and the lock icon on the privacy line (the one exception: the privacy promise is the core of Silar). Never buttons, text or warnings: on Dager it is only 3.1:1, below the 4.5:1 text needs |

Warnings: background `#FBF3D5`, border `#E6D38F`, body text `#3D3A2A`, title and triangle icon in Natt. Never Glöd, so the drop keeps its meaning.

## Typography
- UI and headings: Schibsted Grotesk 400, 500, 700 (800 only in the logo)
- Result and anything the user copies: JetBrains Mono 400
- Self-host both as woff2 from the app's own origin (`@fontsource/schibsted-grotesk`, `@fontsource/jetbrains-mono`). No Google Fonts at runtime

## Shape and space
- Radius 12 px on panels, 8 px on buttons
- Buttons and targets at least 44 px tall
- Drop zone: 2 px dashed border, solid Signal border and Nät fill while dragging

## Voice
Short and dry. Swedish.
- Heading: "Sila dina texter. Spara dina tokens."
- Sub: none; the heading stands alone above the drop zone
- States: "Silar …", "Silat.", "Kopierat."
- Buttons: "Välj fil", "Kopiera", "Ladda ned .md"

## App screens
Reference artboards on the canvas, row "Webbappen". Build to match them.

- **Start page** (`Start.dc.html`): light header with logo and the "Så funkar det" link, hero heading, then on desktop two columns as on the "Riktning B · Raster" board: drop zone on the left (about a third, white, 2 px dashed `#9BA6BE`) and the dark result panel on the right. Before the first file the right panel shows a dimmed example ("Exempel", Silar's real output for the minutes fixture, "Ditt resultat visas här."), at the same height as the drop zone. The drop zone stays next to the result, so a new file replaces it directly; next to a long result it keeps its height and sticks to the top while scrolling. The privacy line with lock icon sits right under the drop zone, so it is always next to where the file goes in. Under it, once a file has been strained, "Silade filer": up to 10 results from this tab, newest first, the shown one in bold. Clicking one shows it again. Memory only, never stored, so the list says "Sparas inte. Listan försvinner när du stänger fliken." No further sections: why to strain first and what each format gives are in the "Så funkar det" modal. Then footer "Ett verktyg från Prompt Agency · Källkod på GitHub"
- **Så funkar det**: the header link opens a modal dialog (white panel, 12 px radius, dimmed Natt backdrop, sticky header with "Stäng") holding the three steps and "Vanliga frågor", an FAQ of native `<details>` rows with + and − in Signal. Closes on Esc, "Stäng" or a click outside
- **Flow** (`Flode.dc.html`): 1 file dragged anywhere on the page (Nät fill, Signal border, "Släpp för att sila"), 2 first-time parser load with progress, 3 converting with file name and page count, 4 result, 5 unsupported format
- **Result**: dark panel (Natt). Header row with check, "Silat.", file name, characters and approximate tokens, buttons "Kopiera" (Signal), "Ladda ned .md" (outline); "Sila en till" (text link) on phones only. Markdown in JetBrains Mono, read only. "Kopiera" shows "Kopierat." for two seconds
- **Warnings** (`Varningar.dc.html`): scanned PDF replaces the result; other warnings sit above the result as a status row. Missing pages are also marked inside the Markdown as `<!-- Sida N saknar text -->`
- **Phone** (`MobilStart`, `MobilResultat`): no drag-and-drop copy, a full-width "Välj dokument" button. Result fills the screen with a fixed bottom bar: "Kopiera" full width and a share/save icon button using the Web Share API where available
- **Dark mode**: not in this version
