from pathlib import Path
import re

APP = Path(__file__).resolve().parents[1] / "app"
LINK = '      <a class="app-nav-link not-tribute-nav" href="100-percent-not-tribute.html"><span class="nav-ico">NT</span><span><strong>100% NOT Tribute</strong><small>Character management preview</small></span></a>\n'

updated = 0
for page in APP.glob("*.html"):
    if page.name in {"dev-panel.html", "100-percent-not-tribute.html"}:
        continue
    text = page.read_text(encoding="utf-8")
    if 'href="100-percent-not-tribute.html"' in text:
        continue
    nav = re.search(r'<nav class="app-side-nav" aria-label="Primary app navigation">[\s\S]*?</nav>', text)
    if not nav:
        continue
    old_nav = nav.group(0)
    marker = re.search(r'(?m)^\s*<a class="app-nav-link(?: active)?" href="tutorials\.html">', old_nav)
    if not marker:
        raise RuntimeError(f"Tutorial navigation marker not found in {page.name}")
    new_nav = old_nav[:marker.start()] + LINK + old_nav[marker.start():]
    page.write_text(text[:nav.start()] + new_nav + text[nav.end():], encoding="utf-8")
    updated += 1

print(f"Added 100% NOT Tribute navigation to {updated} pages")
