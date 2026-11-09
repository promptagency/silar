"""Generate the Silar test fixture set. All people and organisations are fictional."""
import csv
import json
import os
from datetime import date
from pathlib import Path

from docx import Document
from docx.opc.constants import RELATIONSHIP_TYPE as RT
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Pt
from openpyxl import Workbook
from openpyxl.styles import Font
from pptx import Presentation
from pptx.util import Inches
from PIL import Image, ImageDraw, ImageFont
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (BaseDocTemplate, Frame, PageTemplate, Paragraph,
                                SimpleDocTemplate, Spacer, Table, TableStyle,
                                FrameBreak, Image as RLImage, PageBreak)

OUT = Path(__file__).parent
OUT.mkdir(exist_ok=True)
FONT_DIR = os.environ.get("FONT_DIR", "/usr/share/fonts/truetype/dejavu/")
pdfmetrics.registerFont(TTFont("DV", FONT_DIR + "DejaVuSans.ttf"))
pdfmetrics.registerFont(TTFont("DVB", FONT_DIR + "DejaVuSans-Bold.ttf"))

H1 = ParagraphStyle("h1", fontName="DVB", fontSize=18, leading=22, spaceAfter=8)
H2 = ParagraphStyle("h2", fontName="DVB", fontSize=13, leading=17, spaceBefore=8, spaceAfter=4)
BODY = ParagraphStyle("body", fontName="DV", fontSize=10, leading=14, spaceAfter=6)
CELL = ParagraphStyle("cell", fontName="DV", fontSize=9, leading=11)

LOREM_SV = ("Arbetet under perioden har fokuserat på att förenkla rutinerna för ansökningar och "
            "att minska handläggningstiden. Förvaltningen har genomfört en kartläggning av "
            "befintliga flöden och identifierat flera moment där samma uppgifter matas in två gånger. ")

checks = {}

# 01 docx: meeting minutes with headings, lists, table, bold
d = Document()
d.add_heading("Protokoll styrelsemöte Lerums seglarklubb", 0)
d.add_paragraph("Datum 2026-10-14, plats klubbhuset Aspen.")
d.add_heading("1. Närvarande", 1)
for n in ["Åsa Lindqvist, ordförande", "Jörgen Öberg, kassör", "Märta Ek, sekreterare"]:
    d.add_paragraph(n, style="List Bullet")
d.add_heading("2. Ekonomi", 1)
p = d.add_paragraph("Kassören redovisade att resultatet är ")
p.add_run("positivt med 42 300 kr").bold = True
p.add_run(" efter tredje kvartalet.")
t = d.add_table(rows=4, cols=3)
t.style = "Table Grid"
for i, row in enumerate([("Post", "Budget", "Utfall"), ("Medlemsavgifter", "120 000", "118 500"),
                         ("Bryggavgifter", "80 000", "86 200"), ("Underhåll", "-60 000", "-41 900")]):
    for j, v in enumerate(row):
        t.cell(i, j).text = v
d.add_heading("3. Beslut", 1)
for n in ["Styrelsen beslutade att köpa en ny följebåt.", "Höstarbetsdagen flyttas till 8 november.",
          "Sekreteraren får i uppdrag att uppdatera stadgarna."]:
    d.add_paragraph(n, style="List Number")
d.save(OUT / "01-protokoll-styrelsemote.docx")
checks["01-protokoll-styrelsemote.docx"] = {
    "must_contain": ["# Protokoll styrelsemöte", "## 1. Närvarande", "Åsa Lindqvist", "**positivt med 42 300 kr**",
                     "| Medlemsavgifter | 120 000 | 118 500 |", "1. Styrelsen beslutade"],
    "tests": "Headings, bullet and numbered lists, bold run, simple table, Swedish characters"}

# 02 docx: quote with header/footer, nested list, merged cells
d = Document()
sec = d.sections[0]
sec.header.paragraphs[0].text = "Prompt Exempel AB · Offert 2026-117"
sec.footer.paragraphs[0].text = "Konfidentiellt · Org.nr 559000-0000"
d.add_heading("Offert AI Discovery för Bryggeri Nordväst", 0)
d.add_heading("Omfattning", 1)
d.add_paragraph("Intervjuer med nyckelpersoner", style="List Bullet")
d.add_paragraph("Ledningsgrupp", style="List Bullet 2")
d.add_paragraph("Produktion och lager", style="List Bullet 2")
d.add_paragraph("Statusrapport över AI-mognad", style="List Bullet")
d.add_heading("Pris", 1)
t = d.add_table(rows=4, cols=3)
t.style = "Table Grid"
a = t.cell(0, 0).merge(t.cell(0, 2)); a.text = "Fast pris, två veckor"
for i, row in enumerate([("Moment", "Timmar", "Belopp"), ("Intervjuer", "16", "19 200 kr"),
                         ("Rapport", "12", "14 400 kr")], start=1):
    for j, v in enumerate(row):
        t.cell(i, j).text = v
para = d.add_paragraph("Priset gäller i 30 dagar. ")
para.add_run("Moms tillkommer.").italic = True
d.save(OUT / "02-offert-sidhuvud.docx")
checks["02-offert-sidhuvud.docx"] = {
    "must_contain": ["# Offert AI Discovery", "- Intervjuer med nyckelpersoner\n  - Ledningsgrupp\n  - Produktion och lager\n- Statusrapport", "| Intervjuer | 16 | 19 200 kr |", "*Moms tillkommer.*"],
    "should_handle": "Header/footer text either omitted or placed once, not repeated. Nested list indented. Merged cell row not breaking the table.",
    "tests": "Header and footer, nested list, merged table cells, italic"}

# 03 xlsx: multiple sheets, formulas, empty rows, Swedish number formats
wb = Workbook()
ws = wb.active; ws.title = "Budget 2027"
ws.append(["Föreningens budget 2027"]); ws["A1"].font = Font(bold=True, size=14)
ws.append([])
ws.append(["Kategori", "Q1", "Q2", "Q3", "Q4", "Summa"])
rows = [("Medlemsavgifter", 60000, 20000, 10000, 30000), ("Bryggavgifter", 0, 40000, 40000, 0),
        ("Utbildning", -5000, -12000, -18000, -3000), ("Underhåll", -10000, -25000, -15000, -10000)]
for r_i, r in enumerate(rows, start=4):
    ws.append(list(r) + [f"=SUM(B{r_i}:E{r_i})"])
ws.append(["Totalt"] + [f"=SUM({c}4:{c}7)" for c in "BCDEF"])
ws2 = wb.create_sheet("Kontaktlista")
ws2.append(["Namn", "Roll", "Telefon"])
ws2.append(["Göran Åkesson", "Hamnkapten", "070-000 00 01"])
ws2.append(["Lena Strömberg", "Ungdomsledare", "070-000 00 02"])
wb.create_sheet("Tom flik")
wb.save(OUT / "03-budget-forening.xlsx")
checks["03-budget-forening.xlsx"] = {
    "must_contain": ["## Budget 2027", "## Kontaktlista", "Medlemsavgifter", "Göran Åkesson"],
    "should_handle": "Formula cells show cached value or formula consistently (note: file saved by openpyxl has NO cached values, a realistic edge case for files not opened in Excel). Empty sheet skipped or marked empty. Title row above table not treated as header.",
    "tests": "Multiple sheets, formulas without cached values, empty sheet, title row above header"}

# 04 csv: Swedish Excel export, semicolon, decimal comma, cp1252
with open(OUT / "04-export-svensk-excel.csv", "w", encoding="cp1252", newline="") as f:
    w = csv.writer(f, delimiter=";")
    w.writerow(["Artikel", "Antal", "Pris", "Kommentar"])
    w.writerow(["Flytväst barn", "12", "449,50", "Färg: röd"])
    w.writerow(["Kapell Optimist", "3", "1 299,00", "Beställd; levereras v. 48"])
    w.writerow(["Sjökort Göteborgs skärgård", "5", "289,00", ""])
checks["04-export-svensk-excel.csv"] = {
    "must_contain": ["| Flytväst barn | 12 | 449,50 |", "Sjökort Göteborgs skärgård", "Beställd; levereras v. 48"],
    "tests": "Semicolon delimiter, decimal comma, cp1252 encoding (å ä ö must not become mojibake), quoted field containing delimiter"}

# 05 pptx: titles, bullets, notes, table, empty slide
prs = Presentation()
s = prs.slides.add_slide(prs.slide_layouts[0])
s.shapes.title.text = "AI i vardagen"
s.placeholders[1].text = "Workshop för kommunens HR-avdelning"
s = prs.slides.add_slide(prs.slide_layouts[1])
s.shapes.title.text = "Tre saker att ta med sig"
tf = s.placeholders[1].text_frame
tf.text = "Börja med ett verkligt problem"
for txt, lvl in [("Inte med verktyget", 1), ("Maskera personuppgifter först", 0), ("Mät tidsvinsten", 0)]:
    p = tf.add_paragraph(); p.text = txt; p.level = lvl
s.notes_slide.notes_text_frame.text = "Fråga publiken vilka uppgifter som tar mest tid i dag."
s = prs.slides.add_slide(prs.slide_layouts[5])
s.shapes.title.text = "Jämförelse av verktyg"
tbl = s.shapes.add_table(3, 3, Inches(1), Inches(2), Inches(8), Inches(1.5)).table
for i, row in enumerate([("Verktyg", "Lokalt", "Pris"), ("Skrubba", "Ja", "Gratis"), ("Molntjänst X", "Nej", "200 kr/mån")]):
    for j, v in enumerate(row):
        tbl.cell(i, j).text = v
prs.slides.add_slide(prs.slide_layouts[6])
prs.save(OUT / "05-workshop-presentation.pptx")
checks["05-workshop-presentation.pptx"] = {
    "must_contain": ["AI i vardagen", "Tre saker att ta med sig", "Inte med verktyget", "Fråga publiken",
                     "| Skrubba | Ja | Gratis |"],
    "should_handle": "One section per slide in order. Indented sub-bullet. Speaker notes included and marked. Empty slide skipped or minimal.",
    "tests": "Title slide, bullet levels, speaker notes, table, blank slide"}


def page_deco(title):
    def _draw(canvas, doc):
        canvas.saveState()
        canvas.setFont("DV", 8)
        canvas.drawString(20 * mm, A4[1] - 12 * mm, title)
        canvas.drawRightString(A4[0] - 20 * mm, 12 * mm, f"Sida {doc.page}")
        canvas.restoreState()
    return _draw


# 06 pdf: multipage report with repeating header/footer
story = [Paragraph("Verksamhetsrapport 2026", H1)]
for sec_title in ["Inledning", "Handläggning", "Digitalisering", "Ekonomi", "Slutsatser"]:
    story.append(Paragraph(sec_title, H2))
    for _ in range(4):
        story.append(Paragraph(LOREM_SV * 2, BODY))
story.append(Paragraph("Rapporten är fastställd av nämnden den 12 oktober 2026.", BODY))
doc = SimpleDocTemplate(str(OUT / "06-rapport-flera-sidor.pdf"), pagesize=A4, topMargin=25 * mm, bottomMargin=25 * mm)
deco = page_deco("Socialförvaltningen Exempelby · Verksamhetsrapport")
doc.build(story, onFirstPage=deco, onLaterPages=deco)
checks["06-rapport-flera-sidor.pdf"] = {
    "must_contain": ["Verksamhetsrapport 2026", "Handläggning", "fastställd av nämnden"],
    "must_not_contain_repeated": ["Socialförvaltningen Exempelby · Verksamhetsrapport", "Sida 2"],
    "should_handle": "Headings detected from font size. Running header and page numbers removed. Paragraphs not broken mid-sentence at page breaks.",
    "tests": "Multi-page text PDF, repeating header and footer, heading detection"}

# 07 pdf: table with lines
data = [["Skola", "Elever", "Andel behöriga", "Kommentar"],
        ["Ekenässkolan", "412", "91 %", "Ökning jämfört med 2025"],
        ["Hulans skola", "287", "84 %", ""],
        ["Floda centralskola", "530", "88 %", "Ny rektor från augusti"],
        ["Totalt", "1 229", "88 %", ""]]
data = [[Paragraph(c, CELL) for c in row] for row in data]
tbl = Table(data, colWidths=[45 * mm, 25 * mm, 35 * mm, 60 * mm])
tbl.setStyle(TableStyle([("GRID", (0, 0), (-1, -1), 0.5, colors.black),
                         ("BACKGROUND", (0, 0), (-1, 0), colors.lightgrey)]))
story = [Paragraph("Behörighet till gymnasiet per skola", H1),
         Paragraph("Tabellen visar andelen elever i årskurs 9 som är behöriga till nationellt program.", BODY),
         tbl, Spacer(1, 8), Paragraph("Källa: fiktiva siffror för test.", BODY)]
SimpleDocTemplate(str(OUT / "07-pdf-tabell.pdf"), pagesize=A4).build(story)
checks["07-pdf-tabell.pdf"] = {
    "must_contain": ["Behörighet till gymnasiet", "Ekenässkolan", "Floda centralskola"],
    "ideal": "| Ekenässkolan | 412 | 91 % | Ökning jämfört med 2025 |",
    "acceptable": "Each row on its own line with values in correct order and row integrity kept.",
    "tests": "Ruled table, empty cells, wrapped cell text. Known hard case for pdf.js"}

# 08 pdf: two-column newsletter
doc = BaseDocTemplate(str(OUT / "08-pdf-tvaspalt.pdf"), pagesize=A4)
w, h = A4
m, gap = 20 * mm, 8 * mm
colw = (w - 2 * m - gap) / 2
title_frame = Frame(m, h - m - 25 * mm, w - 2 * m, 25 * mm, id="title")
left = Frame(m, m, colw, h - 2 * m - 27 * mm, id="left")
right = Frame(m + colw + gap, m, colw, h - 2 * m - 27 * mm, id="right")
doc.addPageTemplates([PageTemplate(frames=[title_frame, left, right])])
story = [Paragraph("Klubbnytt hösten 2026", H1), FrameBreak(),
         Paragraph("VÄNSTER SPALT BÖRJAR", H2), Paragraph(LOREM_SV * 3, BODY),
         Paragraph("Ny ungdomsledare", H2), Paragraph("Lena Strömberg tar över ungdomsverksamheten. " + LOREM_SV, BODY),
         Paragraph("VÄNSTER SPALT SLUTAR.", BODY), FrameBreak(),
         Paragraph("HÖGER SPALT BÖRJAR", H2), Paragraph(LOREM_SV * 3, BODY),
         Paragraph("Upptagning av båtar", H2), Paragraph("Kranen är bokad lördag 1 november klockan 08.00. " + LOREM_SV, BODY),
         Paragraph("HÖGER SPALT SLUTAR.", BODY)]
doc.build(story)
checks["08-pdf-tvaspalt.pdf"] = {
    "must_contain": ["Klubbnytt hösten 2026", "Ny ungdomsledare", "Upptagning av båtar"],
    "order": ["VÄNSTER SPALT BÖRJAR", "VÄNSTER SPALT SLUTAR", "HÖGER SPALT BÖRJAR", "HÖGER SPALT SLUTAR"],
    "fail_if": "Lines from left and right column interleave",
    "tests": "Two-column layout reading order"}


# 09 pdf: scanned (image only, no text layer)
def text_image(lines, path, rotate=0.6):
    img = Image.new("L", (1240, 1754), 245)
    dr = ImageDraw.Draw(img)
    f_big = ImageFont.truetype(FONT_DIR + "DejaVuSerif-Bold.ttf", 44)
    f = ImageFont.truetype(FONT_DIR + "DejaVuSerif.ttf", 28)
    y = 140
    dr.text((120, y), lines[0], font=f_big, fill=30); y += 100
    for ln in lines[1:]:
        dr.text((120, y), ln, font=f, fill=40); y += 46
    img.rotate(rotate, fillcolor=245).save(path, quality=70)


scan_lines = ["Hyresavtal förråd", "Mellan Lerums seglarklubb och hyresgästen",
              "Förråd nummer 14 i klubbhuset uthyres för", "perioden 1 januari till 31 december 2027.",
              "Hyran är 1 200 kronor per år och betalas", "i förskott senast den 31 januari.", "",
              "Underskrift ________________________"]
text_image(scan_lines, "/tmp/scan1.jpg")
from reportlab.pdfgen import canvas as rl_canvas
c = rl_canvas.Canvas(str(OUT / "09-pdf-skannad.pdf"), pagesize=A4)
c.drawImage("/tmp/scan1.jpg", 0, 0, width=w, height=h)
c.showPage(); c.save()
checks["09-pdf-skannad.pdf"] = {
    "expect_warning": "no_text_layer",
    "must_not_contain": ["Hyresavtal"],
    "tests": "Image-only PDF. Must produce a clear warning, not an empty result without explanation"}

# 10 pdf: mixed, text pages plus one scanned page
text_image(["Bilaga 2 Kvitto", "Inköp av livbojar 3 st", "Summa 2 670 kr"], "/tmp/scan2.jpg")
story = [Paragraph("Ansökan om föreningsbidrag", H1),
         Paragraph("Lerums seglarklubb ansöker om bidrag för säkerhetsutrustning.", BODY),
         Paragraph(LOREM_SV * 2, BODY), PageBreak(),
         RLImage("/tmp/scan2.jpg", width=150 * mm, height=212 * mm), PageBreak(),
         Paragraph("Bilaga 3 Verksamhetsplan", H2), Paragraph(LOREM_SV, BODY)]
SimpleDocTemplate(str(OUT / "10-pdf-blandad.pdf"), pagesize=A4).build(story)
checks["10-pdf-blandad.pdf"] = {
    "must_contain": ["Ansökan om föreningsbidrag", "Bilaga 3 Verksamhetsplan"],
    "expect_warning": "page_without_text: 2",
    "tests": "Mixed PDF where one page is scanned. Warning should name the page, rest converts normally"}

# 11 xlsx: dates and percentages must show as displayed, not as serial numbers
wb = Workbook()
ws = wb.active; ws.title = "Uppföljning"
ws.append(["Datum", "Andel klar", "Kostnad"])
for d_, share, share_fmt, cost, date_fmt in [
        (date(2026, 3, 15), 0.125, "0.0%", 1234.5, "mm-dd-yy"),  # built-in format 14, the locale's short date
        (date(2026, 4, 1), 0.5, "0%", 980, "yyyy-mm-dd")]:
    ws.append([d_, share, cost])
    r = ws.max_row
    ws.cell(r, 1).number_format = date_fmt
    ws.cell(r, 2).number_format = share_fmt
    ws.cell(r, 3).number_format = "#,##0.00"
wb.save(OUT / "11-datum-procent.xlsx")
serial = (date(2026, 3, 15) - date(1899, 12, 30)).days
checks["11-datum-procent.xlsx"] = {
    "must_contain": ["## Uppföljning", "| 2026-03-15 | 12,5% | 1 234,50 |", "| 2026-04-01 | 50% | 980,00 |"],
    "must_not_contain": [str(serial), "0.125"],
    "tests": "Date cells (built-in short date and custom yyyy-mm-dd), percentages, thousands separator and decimals as Swedish Excel shows them"}


# 12 docx: hyperlinks kept as [text](url)
def add_link(paragraph, text, url):
    r_id = paragraph.part.relate_to(url, RT.HYPERLINK, is_external=True)
    link = OxmlElement("w:hyperlink"); link.set(qn("r:id"), r_id)
    run = OxmlElement("w:r"); t = OxmlElement("w:t"); t.text = text
    run.append(t); link.append(run); paragraph._p.append(link)


d = Document()
d.add_heading("Länkar för nya styrelseledamöter", 1)
p = d.add_paragraph("Läs ")
add_link(p, "föreningsguiden", "https://example.se/foreningsguide")
p.add_run(" innan första mötet.")
p = d.add_paragraph("Stadgarna: ", style="List Bullet")
add_link(p, "stadgar 2026", "https://example.se/stadgar?ar=2026")
d.save(OUT / "12-lankar.docx")
checks["12-lankar.docx"] = {
    "must_contain": ["Läs [föreningsguiden](https://example.se/foreningsguide) innan första mötet.",
                     "- Stadgarna: [stadgar 2026](https://example.se/stadgar?ar=2026)"],
    "tests": "External hyperlinks in a paragraph and a list item, URL with query string"}

# 13 xlsx: hidden sheet, row and column must stay out of the output
wb = Workbook()
ws = wb.active; ws.title = "Deltagare"
ws.append(["Namn", "Personnummer", "Ort"])
ws.append(["Åsa Lindqvist", "19800101-0000", "Lerum"])
ws.append(["Dold Rad", "19900101-0000", "Alingsås"])
ws.append(["Jörgen Öberg", "19700101-0000", "Floda"])
ws.row_dimensions[3].hidden = True
ws.column_dimensions["B"].hidden = True
ws2 = wb.create_sheet("Löner")
ws2.append(["Namn", "Månadslön"])
ws2.append(["Åsa Lindqvist", 41000])
ws2.sheet_state = "hidden"
wb.save(OUT / "13-dolda-delar.xlsx")
checks["13-dolda-delar.xlsx"] = {
    "must_contain": ["## Deltagare", "| Åsa Lindqvist | Lerum |", "| Jörgen Öberg | Floda |"],
    "must_not_contain": ["Löner", "Månadslön", "41", "Dold Rad", "Personnummer", "19800101"],
    "tests": "Hidden sheet, hidden row and hidden column are left out, as hidden slides are in pptx"}

# 14 docx: nested lists, by numbering level (how Word nests with Tab) and by style
def add_levels(style, fmt, text):
    """python-docx's template defines level 0 only; Word defines 9. Add levels 1 and 2 as Word writes them."""
    num_id = d.styles[style].element.pPr.numPr.numId.val
    numbering = d.part.numbering_part.element
    abstract_id = numbering.xpath(f'w:num[@w:numId="{num_id}"]/w:abstractNumId')[0].get(qn("w:val"))
    abstract = numbering.xpath(f'w:abstractNum[@w:abstractNumId="{abstract_id}"]')[0]
    for ilvl in (1, 2):
        lvl = OxmlElement("w:lvl"); lvl.set(qn("w:ilvl"), str(ilvl))
        for tag, val in [("w:start", "1"), ("w:numFmt", fmt), ("w:lvlText", text.replace("N", str(ilvl + 1)))]:
            e = OxmlElement(tag); e.set(qn("w:val"), val); lvl.append(e)
        abstract.append(lvl)

def at_level(p, style, ilvl):
    num_id = d.styles[style].element.pPr.numPr.numId.val
    num_pr = p._p.get_or_add_pPr().get_or_add_numPr()
    num_pr.get_or_add_ilvl().val = ilvl
    num_pr.get_or_add_numId().val = num_id

d = Document()
add_levels("List Number", "lowerLetter", "%N.")
add_levels("List Bullet", "bullet", "o")
d.add_heading("Arbetsplan", 1)
d.add_paragraph("Förbered workshop", style="List Number")
for t in ["Boka lokal i Lerum", "Skicka inbjudan"]:
    at_level(d.add_paragraph(t, style="List Number"), "List Number", 1)
d.add_paragraph("Genomför workshop", style="List Number")
d.add_heading("Risker", 1)
d.add_paragraph("Tid", style="List Bullet")
at_level(d.add_paragraph("Semestrar i juli", style="List Bullet"), "List Bullet", 1)
at_level(d.add_paragraph("Gäller även konsulter", style="List Bullet"), "List Bullet", 2)
d.add_paragraph("Budget", style="List Bullet")
d.add_heading("Uppföljning", 1)
d.add_paragraph("Sammanställ svar", style="List Number")
d.add_paragraph("Per avdelning", style="List Number 2")
d.add_paragraph("Per roll", style="List Number 2")
d.save(OUT / "14-nastlade-listor.docx")
checks["14-nastlade-listor.docx"] = {
    "must_contain": ["1. Förbered workshop\n   1. Boka lokal i Lerum\n   2. Skicka inbjudan\n2. Genomför workshop",
                     "- Tid\n  - Semestrar i juli\n    - Gäller även konsulter\n- Budget",
                     "1. Sammanställ svar\n   1. Per avdelning\n   2. Per roll"],
    "tests": "Nested lists by numbering level (Tab in Word) and by List Number 2 style, indented under their parent item"}

# 15-17 pdf: scanned pages that also carry a little real text (stamp, page number)
def scan_with_text(c, image, text):
    c.drawImage(image, 0, 0, width=w, height=h)
    c.setFont("DV", 10)
    c.drawString(380, 600, text)
    c.showPage()


def text_page(c, text):
    c.setFont("DV", 10)
    c.drawString(72, 700, text)
    c.showPage()


c = rl_canvas.Canvas(str(OUT / "15-pdf-skannad-stampel.pdf"), pagesize=A4)
text_page(c, "Förvaltningen har genomfört en kartläggning utan")
scan_with_text(c, "/tmp/scan2.jpg", "Dnr 2026/114")
text_page(c, "Uppföljningen visar att rutinerna fungerar.")
c.save()
checks["15-pdf-skannad-stampel.pdf"] = {
    "must_contain": ["utan\n\nDnr 2026/114\n\n<!-- Sida 2 saknar text -->\n\nUppföljningen"],
    "expect_warning": "page_without_text: 2",
    "tests": "Scanned page with a diary stamp: warned, stamp kept, not glued to the neighbouring pages"}

Image.new("L", (400, 200), 120).save("/tmp/logo.jpg", quality=70)
c = rl_canvas.Canvas(str(OUT / "16-pdf-omslag-logotyp.pdf"), pagesize=A4)
c.drawImage("/tmp/logo.jpg", 200, 600, width=200, height=100)
c.setFont("DVB", 18)
c.drawString(72, 500, "Årsredovisning 2026")
c.showPage()
text_page(c, "Styrelsen lämnar härmed sin berättelse för året.")
c.save()
checks["16-pdf-omslag-logotyp.pdf"] = {
    "must_contain": ["Årsredovisning 2026"],
    "must_not_contain": ["saknar text"],
    "tests": "Cover with a small logo and a short title is not a scanned page"}

c = rl_canvas.Canvas(str(OUT / "17-pdf-skannad-sidnummer.pdf"), pagesize=A4)
scan_with_text(c, "/tmp/scan1.jpg", "Sida 1 av 2")
scan_with_text(c, "/tmp/scan2.jpg", "Sida 2 av 2")
c.save()
checks["17-pdf-skannad-sidnummer.pdf"] = {
    "expect_warning": "no_text_layer",
    "must_not_contain": ["Sida 1 av 2"],
    "tests": "Every page scanned with only a page number on top: OCR advice, not an empty result"}

(OUT / "checks.json").write_text(json.dumps(checks, ensure_ascii=False, indent=2), encoding="utf-8")
print("\n".join(sorted(p.name for p in OUT.iterdir())))
