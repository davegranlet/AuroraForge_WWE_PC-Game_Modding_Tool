from pathlib import Path
from docx import Document
from docx.table import Table
from docx.text.paragraph import Paragraph
from docx.oxml.table import CT_Tbl
from docx.oxml.text.paragraph import CT_P
import html, re

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / "app"
DOCX = APP / "downloads" / "Aurora_Forge_Reader_Handbook.docx"
PAGE = APP / "handbook-reader.html"

def slug(text):
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-") or "section"

def inline(paragraph):
    out = []
    for run in paragraph.runs:
        value = html.escape(run.text)
        if not value:
            continue
        if run.bold:
            value = f"<strong>{value}</strong>"
        if run.italic:
            value = f"<em>{value}</em>"
        out.append(value)
    return "".join(out) or html.escape(paragraph.text)

def iter_blocks(document):
    for child in document.element.body.iterchildren():
        if isinstance(child, CT_P):
            yield Paragraph(child, document)
        elif isinstance(child, CT_Tbl):
            yield Table(child, document)

def render_table(table):
    rows = [[cell.text.strip() for cell in row.cells] for row in table.rows]
    rows = [row for row in rows if any(row)]
    if not rows:
        return ""
    if len(rows) == 1 and len(rows[0]) <= 2:
        text = " ".join(part for part in rows[0] if part)
        if not text:
            return ""
        kind = "warning" if text.upper().startswith(("STOP IF", "WARNING", "DO NOT")) else "note"
        return f'<aside class="handbook-callout {kind}">{html.escape(text)}</aside>'
    output = ['<div class="handbook-table-wrap"><table><thead><tr>']
    output.extend(f"<th>{html.escape(cell)}</th>" for cell in rows[0])
    output.append("</tr></thead><tbody>")
    for row in rows[1:]:
        output.append("<tr>" + "".join(f"<td>{html.escape(cell)}</td>" for cell in row) + "</tr>")
    output.append("</tbody></table></div>")
    return "".join(output)

document = Document(DOCX)
article, toc, ids = [], [], {}
list_open = False
for block in iter_blocks(document):
    if isinstance(block, Table):
        if list_open:
            article.append("</ul>")
            list_open = False
        article.append(render_table(block))
        continue
    text = block.text.strip()
    if not text:
        continue
    if block.style.name == "List Bullet":
        if not list_open:
            article.append("<ul>")
            list_open = True
        article.append(f"<li>{inline(block)}</li>")
        continue
    if list_open:
        article.append("</ul>")
        list_open = False
    if block.style.name.startswith("Heading"):
        level = int(re.search(r"\d+", block.style.name).group())
        base = slug(text)
        ids[base] = ids.get(base, 0) + 1
        anchor = base if ids[base] == 1 else f"{base}-{ids[base]}"
        tag = "h1" if level == 1 else "h2"
        article.append(f'<{tag} id="{anchor}">{html.escape(text)}</{tag}>')
        toc.append(f'<a class="handbook-toc-level-{level}" href="#{anchor}">{html.escape(text)}</a>')
    else:
        article.append(f"<p>{inline(block)}</p>")
if list_open:
    article.append("</ul>")

source = PAGE.read_text(encoding="utf-8")
source = re.sub(
    r'(<nav class="handbook-toc"[^>]*>).*?(</nav>)',
    r'\1' + "".join(toc) + r'\2', source, count=1, flags=re.S
)
source = re.sub(
    r'(<article class="handbook-article" id="handbook-article">).*?(</article>)',
    r'\1' + "".join(article) + r'\2', source, count=1, flags=re.S
)
source = source.replace("WWE 2K25 &amp; WWE 2K26 PC Modding Handbook", "WWE 2K26 PC Modding Handbook")
source = source.replace("Handbook 3.0", "Reader Handbook")
source = source.replace("downloads/Aurora_Forge_Complete_WWE_2K25_2K26_PC_Modding_Handbook.pdf", "downloads/Aurora_Forge_Reader_Handbook.pdf")
PAGE.write_text(source, encoding="utf-8")

tutorials = APP / "tutorials.html"
tutorial_text = tutorials.read_text(encoding="utf-8")
tutorial_text = tutorial_text.replace("Aurora_Forge_Complete_WWE_2K25_2K26_PC_Modding_Handbook.pdf", "Aurora_Forge_Reader_Handbook.pdf")
tutorial_text = tutorial_text.replace("Aurora_Forge_Complete_WWE_2K25_2K26_PC_Modding_Handbook.docx", "Aurora_Forge_Reader_Handbook.docx")
tutorial_text = re.sub(r'\s*<a class="ai-btn secondary" href="downloads/Aurora_Forge_Complete_WWE_2K25_2K26_PC_Modding_Handbook\.md"[^>]*>.*?</a>', '', tutorial_text)
tutorial_text = tutorial_text.replace("WWE 2K25 &amp; WWE 2K26", "WWE 2K26")
tutorials.write_text(tutorial_text, encoding="utf-8")

for old_name in (
    "Aurora_Forge_Complete_WWE_2K25_2K26_PC_Modding_Handbook.md",
    "Aurora_Forge_Complete_WWE_2K25_2K26_PC_Modding_Handbook.docx",
    "Aurora_Forge_Complete_WWE_2K25_2K26_PC_Modding_Handbook.pdf",
):
    old_path = APP / "downloads" / old_name
    if old_path.exists():
        old_path.unlink()
print(f"Integrated {len(toc)} handbook headings and {len(article)} content blocks")
