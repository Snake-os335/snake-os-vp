#!/usr/bin/env python3
"""Patch Snake OS index.html: Doganiero AI browser geolocation + reverse geocode context."""
from __future__ import annotations

import datetime as dt
import pathlib
import re
import shutil
import subprocess
import sys

ROOT = pathlib.Path("/srv/juegos_david/snake-os")
INDEX = ROOT / "index.html"
BLOCK_FILE = pathlib.Path(__file__).resolve().parent / "doganiero_location_block.js"
MARKER = "/* Doganiero AI — ubicación del usuario (Geolocation + reverse geocode) */"
BUST = dt.datetime.now().strftime("%Y%m%d%H%M%S")


def die(msg: str) -> None:
    print("ERROR:", msg, file=sys.stderr)
    sys.exit(1)


def main() -> None:
    if not INDEX.is_file():
        die(f"missing {INDEX}")
    if not BLOCK_FILE.is_file():
        die(f"missing {BLOCK_FILE}")

    text = INDEX.read_text(encoding="utf-8")
    orig_len = len(text)

    bak = INDEX.with_name(f"index.html.bak.location-{BUST}")
    shutil.copy2(INDEX, bak)
    print(f"backup -> {bak}")

    block = BLOCK_FILE.read_text(encoding="utf-8")
    if MARKER not in block:
        die("location block missing marker")

    # 1) Insert location helpers before snakeOsNowContext (idempotent)
    if MARKER in text:
        print("location block already present — refreshing in place")
        text = re.sub(
            re.escape(MARKER) + r".*?function snakeOsNowContext\(",
            block.rstrip() + "\n\n  function snakeOsNowContext(",
            text,
            count=1,
            flags=re.S,
        )
    else:
        anchor = "  function snakeOsNowContext(){"
        if anchor not in text:
            die("anchor snakeOsNowContext not found")
        text = text.replace(anchor, block.rstrip() + "\n\n" + anchor, 1)
        print("inserted location block before snakeOsNowContext")

    # 2) Extend aiSystemPromptWithNow to include location context
    old_prompt_ret = (
        "    return AI_SYSTEM_PROMPT + '\\n\\n' + snakeOsNowContext() + '\\n\\n' + fileLine + starBlock;\n"
        "  }"
    )
    new_prompt_ret = (
        "    var locBlock = (typeof doganieroLocationContext === 'function') ? doganieroLocationContext() : '';\n"
        "    return AI_SYSTEM_PROMPT + '\\n\\n' + snakeOsNowContext() +\n"
        "      (locBlock ? ('\\n\\n' + locBlock) : '') + '\\n\\n' + fileLine + starBlock;\n"
        "  }"
    )
    if "doganieroLocationContext()" in text and "var locBlock" in text:
        print("aiSystemPromptWithNow already includes location")
    elif old_prompt_ret in text:
        text = text.replace(old_prompt_ret, new_prompt_ret, 1)
        print("patched aiSystemPromptWithNow")
    else:
        # try looser match
        m = re.search(
            r"return AI_SYSTEM_PROMPT \+ '\\n\\n' \+ snakeOsNowContext\(\) \+ '\\n\\n' \+ fileLine \+ starBlock;\n  \}",
            text,
        )
        if not m:
            die("could not patch aiSystemPromptWithNow return")
        text = text[: m.start()] + new_prompt_ret + text[m.end() :]
        print("patched aiSystemPromptWithNow (regex)")

    # 3) Soft capability line in system prompt (once) — must stay inside the same JS string literal
    needle = "Si preguntan la hora o el día, usa la fecha/hora del contexto."
    loc_capability = (
        "Si el contexto incluye la ubicación GPS del usuario, úsala para responder "
        "«dónde estoy», sitios cercanos, etc.; si no hay ubicación, no inventes una dirección. "
    )
    if "ubicación GPS del usuario" not in text:
        if needle not in text:
            die("prompt needle for location capability not found")
        text = text.replace(needle, loc_capability + needle, 1)
        print("added location capability to AI_SYSTEM_PROMPT")
    else:
        print("location capability already in prompt")

    # 4) UX bar in Doganiero AI UI
    old_bar = (
        "        '<div class=\"ai-model-bar\">' +\n"
        "          '<span class=\"ai-model-label\">Modelo</span>' +\n"
    )
    new_bar = (
        "        '<div class=\"ai-loc-bar\" id=\"aiLocBar-x\" title=\"Doganiero AI usa la ubicación solo para responderte\">' +\n"
        "          '<span class=\"ai-loc-icon\">📍</span>' +\n"
        "          '<span class=\"ai-loc-text\" id=\"aiLocText-x\">Ubicación: se pedirá permiso del navegador…</span>' +\n"
        "          '<button type=\"button\" class=\"ai-loc-btn\" id=\"aiLocBtn-x\">Actualizar</button>' +\n"
        "        '</div>' +\n"
        "        '<div class=\"ai-model-bar\">' +\n"
        "          '<span class=\"ai-model-label\">Modelo</span>' +\n"
    )
    if 'id="aiLocBar-x"' in text or "id=\\\"aiLocBar-x\\\"" in text:
        print("ai loc bar already in markup")
    elif old_bar in text:
        text = text.replace(old_bar, new_bar, 1)
        print("inserted ai loc bar markup")
    else:
        die("ai-model-bar markup not found for loc bar insert")

    # 5) Hook after renderHistory() at end of renderAIApp
    hook = """
    var locTextEl = container.querySelector('#aiLocText-x');
    var locBtnEl = container.querySelector('#aiLocBtn-x');
    function paintAiLocation(loc){
      loc = loc || doganieroUserLocation;
      if(!locTextEl) return;
      if(loc.status === 'ok' && loc.label){
        locTextEl.textContent = 'Ubicación: ' + loc.label;
      } else if(loc.status === 'ok'){
        locTextEl.textContent = 'Ubicación: ' + Number(loc.lat).toFixed(5) + ', ' + Number(loc.lng).toFixed(5);
      } else if(loc.status === 'pending'){
        locTextEl.textContent = 'Ubicación: pidiendo permiso del navegador…';
      } else if(loc.status === 'denied'){
        locTextEl.textContent = 'Ubicación no disponible (permiso denegado). El chat sigue activo.';
      } else if(loc.status === 'unavailable'){
        locTextEl.textContent = 'Ubicación no disponible en este dispositivo.';
      } else if(loc.status === 'error'){
        locTextEl.textContent = 'Ubicación: ' + (loc.message || 'error');
      } else {
        locTextEl.textContent = 'Ubicación: se pedirá permiso del navegador…';
      }
    }
    var unsubLoc = onDoganieroLocation(paintAiLocation);
    paintAiLocation(doganieroUserLocation);
    if(locBtnEl){
      locBtnEl.addEventListener('click', function(){
        ensureDoganieroLocation(true);
      });
    }
    ensureDoganieroLocation(false);

    renderHistory();

    return function cleanup(){
      try { if(typeof unsubLoc === 'function') unsubLoc(); } catch(e){}
      if(controller) controller.abort();
    };
"""
    old_tail = (
        "    renderHistory();\n\n"
        "    return function cleanup(){ if(controller) controller.abort(); };\n"
        "  }"
    )
    if "ensureDoganieroLocation(false)" in text and "aiLocText-x" in text and "unsubLoc" in text:
        # Replace existing hook block between locTextEl and cleanup — keep idempotent by
        # rewriting from "var locTextEl" if present, else skip
        print("location hook appears present — leaving hook as-is if marker matches")
        if "paintAiLocation" not in text:
            die("partial location hook; manual fix needed")
    elif old_tail in text:
        text = text.replace(old_tail, hook.rstrip() + "\n  }", 1)
        print("wired ensureDoganieroLocation into renderAIApp")
    else:
        die("renderAIApp tail not found for location hook")

    # 6) Minimal CSS for loc bar (once) — insert after .ai-model-bar block in real <style>,
    # NEVER via rfind("</style>") (Code Lab builds iframe HTML containing </style> inside JS strings).
    css = (
        "  .ai-loc-bar{display:flex;align-items:center;gap:8px;padding:8px 10px;margin:0 0 6px;"
        "border-radius:12px;background:rgba(31,158,87,.10);border:1px solid rgba(31,158,87,.28);"
        "font-size:12px;line-height:1.35;color:var(--text,#1a2e22)}\n"
        "  .ai-loc-bar .ai-loc-text{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}\n"
        "  .ai-loc-bar .ai-loc-btn{flex:0 0 auto;border:0;border-radius:9px;padding:6px 10px;"
        "background:#1f9e57;color:#fff;font-weight:700;font-size:11px;cursor:pointer}\n"
        "  .ai-loc-bar .ai-loc-btn:active{transform:scale(.98)}\n"
    )
    if ".ai-loc-bar{" not in text:
        m = re.search(r"\.ai-model-bar\{[^{}]*\}", text)
        if not m:
            die("could not find .ai-model-bar{ CSS block for loc bar styles")
        text = text[: m.end()] + "\n" + css + text[m.end() :]
        print("added .ai-loc-bar CSS after .ai-model-bar")
    else:
        print("ai-loc-bar CSS already present")

    # 7) Cache-bust comment at top
    if re.search(r"<!-- doganiero-location-\d+", text):
        text = re.sub(
            r"<!-- doganiero-location-\d+ -->",
            f"<!-- doganiero-location-{BUST} -->",
            text,
            count=1,
        )
    else:
        text = text.replace(
            "<title>Snake OS!</title>",
            f"<title>Snake OS!</title>\n<!-- doganiero-location-{BUST} -->",
            1,
        )
    print(f"cache marker doganiero-location-{BUST}")

    # Also nudge static script ?v= so phones hard-refresh related assets
    def bust_static(name: str, src: str) -> str:
        return re.sub(
            rf'(/static/{re.escape(name)}\?v=)[^"\s]+',
            rf"\g<1>{BUST}",
            src,
            count=1,
        )

    for asset in ("doganiero-chat.js", "desktop-extras.js", "metaverse.js"):
        text2 = bust_static(asset, text)
        if text2 != text:
            print(f"cache-bust {asset} -> {BUST}")
            text = text2

    INDEX.write_text(text, encoding="utf-8")
    print(f"wrote {INDEX} ({orig_len} -> {len(text)} bytes)")

    # Syntax-check extracted inline script chunks that contain our markers
    # Extract all <script> without src
    scripts = re.findall(r"<script(?![^>]*\bsrc=)[^>]*>(.*?)</script>", text, flags=re.S | re.I)
    checked = 0
    for i, body in enumerate(scripts):
        if "doganieroLocationContext" in body or "ensureDoganieroLocation" in body or "Doganiero AI" in body:
            tmp = pathlib.Path(f"/tmp/snake_os_loc_check_{i}.js")
            tmp.write_text(body, encoding="utf-8")
            r = subprocess.run(["node", "--check", str(tmp)], capture_output=True, text=True)
            if r.returncode != 0:
                print(r.stderr)
                die(f"node --check failed for inline script #{i}")
            checked += 1
            print(f"node --check OK inline script #{i}")
    if checked == 0:
        print("WARN: no inline script matched for node --check")

    print("DONE")


if __name__ == "__main__":
    main()
