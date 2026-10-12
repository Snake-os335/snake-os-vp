#!/usr/bin/env python3
from pathlib import Path
import re

INDEX = Path("/srv/juegos_david/snake-os/index.html")
CSS = Path("/workspace/snake-os-voice-games/mv_css_extra.css")
# When run on VM, css is alongside
css_path = Path(__file__).resolve().parent / "mv_css_extra.css"
if not css_path.exists():
    css_path = Path("/srv/juegos_david/snake-os/_mv_css_extra.css")
extra = css_path.read_text(encoding="utf-8")
BUST = "20261001223500"

text = INDEX.read_text(encoding="utf-8")

# cache-bust script
text2, n = re.subn(
    r'(<script src="/static/metaverse\.js\?v=)[^"]+("></script>)',
    rf'\g<1>{BUST}\2',
    text,
    count=1,
)
if n != 1:
    raise SystemExit(f"script tag replace failed n={n}")
text = text2

if ".mv-mic-btn" not in text:
    # insert before explorer-grid or after mv-toast.show block
    marker = "  .mv-toast.show{ opacity:1; }\n"
    if marker not in text:
        raise SystemExit("css marker missing")
    text = text.replace(marker, marker + "\n" + extra + "\n", 1)
    print("CSS inserted")
else:
    print("CSS already present")

INDEX.write_text(text, encoding="utf-8")
print("index.html updated bust", BUST)
