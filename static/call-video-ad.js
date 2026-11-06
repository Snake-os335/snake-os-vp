/* Publicidad propia de software Doganiero, al lado del vídeo de la llamada.
   No entra en el canvas ni en la pista. Sin red, cookies ni medición. */
(function (root, factory) {
  var api = factory(root);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.DoganieroCallAd = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  var SLOTS = [
    {
      app: "chat",
      name: "Doganiero Chat",
      line: "Doganiero Chat es para mensajes y llamadas con otras cuentas.",
      mark: "💬"
    },
    {
      app: "store",
      name: "Doganiero Store",
      line: "Doganiero Store es la tienda. Aquí descargas juegos y herramientas.",
      mark: "🛍️",
      img: "/static/assets/doganiero-store-logo.png?v=bag2"
    },
    {
      app: "ai",
      name: "Doganiero AI",
      line: "Doganiero AI responde, abre apps y puede hablar contigo.",
      mark: "✨",
      img: "/static/assets/doganiero-ai-logo.png"
    },
    {
      app: "browser",
      name: "Doganiero Search",
      line: "Buscar en Doganiero Search.",
      mark: "🔍",
      img: "/static/assets/doganiero-search-logo.png?v=20261015g"
    }
  ];

  function box(left, top, width, height) {
    return {
      left: left,
      top: top,
      width: width,
      height: height,
      right: left + width,
      bottom: top + height
    };
  }

  function stageBox(vw, vh, minimized) {
    var width = Math.min(minimized ? 156 : 360, Math.max(120, vw - 24));
    var height = Math.round(width * 3 / 4);
    var left = vw - 16 - width;
    var top = vh - 92 - height;
    return box(left, top, width, height);
  }

  function hangupBox(vw, vh) {
    var width = Math.min(320, Math.max(120, vw - 16));
    var height = 72;
    var left = Math.round((vw - width) / 2);
    var top = vh - 84 - height;
    if (top < 8) top = 8;
    if (left < 8) left = 8;
    if (left + width > vw - 8) width = vw - 8 - left;
    return box(left, top, width, height);
  }

  function clampBox(rect, vw, vh) {
    var left = Math.max(8, rect.left);
    var top = Math.max(8, rect.top);
    var width = Math.min(rect.width, vw - left - 8);
    var height = Math.min(rect.height, vh - top - 8);
    if (width < 8) width = 8;
    if (height < 8) height = 8;
    return box(left, top, width, height);
  }

  function layout(vw, vh, minimized, measuredHang) {
    var margin = 16;
    var gap = 8;
    var hang = measuredHang ? clampBox(measuredHang, vw, vh) : hangupBox(vw, vh);
    var narrow = vw < 700;
    var stage;
    var ad;
    var mode;
    if (!narrow && !minimized) {
      stage = stageBox(vw, vh, false);
      var sideW = 220;
      var sideH = 168;
      var left = stage.left - gap - sideW;
      var top = Math.max(margin, stage.top);
      if (top + sideH > hang.top - gap) sideH = hang.top - gap - top;
      if (left >= margin && sideH >= 96 && left + sideW <= stage.left - gap) {
        mode = "side";
        ad = box(left, top, sideW, sideH);
      }
    }
    if (!ad && minimized) {
      mode = "mini";
      stage = stageBox(vw, vh, true);
      var miniW = Math.min(stage.width, vw - 16);
      var miniLeft = Math.max(8, Math.min(stage.left, vw - miniW - 8));
      stage = box(miniLeft, Math.max(8, stage.top), miniW, stage.height);
      var aboveTop = Math.max(8, stage.top - gap - 96);
      ad = box(stage.left, aboveTop, stage.width, Math.min(96, stage.top - gap - aboveTop));
    }
    if (!ad) {
      mode = "stack";
      var adH = 132;
      var videoW = Math.max(160, vw - margin * 2);
      var videoH = Math.round(videoW * 3 / 4);
      var limit = hang.top - gap;
      if (margin + adH + gap + videoH > limit) {
        videoH = limit - margin - adH - gap;
        if (videoH < 160) {
          adH = 96;
          videoH = limit - margin - adH - gap;
        }
        if (videoH < 160) videoH = 160;
        videoW = Math.min(videoW, Math.round(videoH * 4 / 3));
      }
      var videoLeft = Math.round((vw - videoW) / 2);
      var videoTop = limit - videoH;
      stage = box(videoLeft, videoTop, videoW, videoH);
      var adW = vw - margin * 2;
      var adTop = Math.max(margin, stage.top - gap - adH);
      if (adTop + adH > stage.top - gap) adH = Math.max(72, stage.top - gap - adTop);
      ad = box(margin, adTop, adW, adH);
    }
    ad = clampBox(ad, vw, vh);
    stage = clampBox(stage, vw, vh);
    return {
      mode: mode,
      moveStage: mode === "stack",
      ad: ad,
      stage: stage,
      hangup: hang,
      controls: controlsBox(stage, minimized)
    };
  }

  function overlaps(a, b) {
    return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
  }

  function controlsBox(stage, minimized) {
    if (minimized) return null;
    var width = Math.min(114, Math.max(34, stage.width - 16));
    return box(stage.left + 8, stage.bottom - 8 - 34, width, 34);
  }

  function wrapsInside(text, maxWidth, charW) {
    var words = String(text || "").split(/\s+/);
    var line = 0;
    var width = Math.max(1, maxWidth);
    var i;
    for (i = 0; i < words.length; i++) {
      var need = words[i].length * charW;
      if (need > width) return false;
      var next = line === 0 ? need : line + charW + need;
      if (next > width) line = need;
      else line = next;
    }
    return true;
  }

  var index = 0;
  var timer = null;

  function paint(aside) {
    var slot = SLOTS[index % SLOTS.length];
    aside.textContent = "";
    var tag = document.createElement("div");
    tag.textContent = "Publicidad";
    tag.style.cssText = "font-size:10px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:#9dffc2;";
    var row = document.createElement("div");
    row.style.cssText = "display:flex;gap:6px;align-items:center;min-width:0;";
    var mark = document.createElement("span");
    mark.textContent = slot.mark;
    mark.style.cssText = "font-size:16px;flex:0 0 auto;";
    if (slot.img) {
      var img = document.createElement("img");
      img.src = slot.img;
      img.alt = "";
      img.width = 22;
      img.height = 22;
      img.style.cssText = "width:22px;height:22px;object-fit:contain;flex:0 0 auto;";
      row.appendChild(img);
    } else {
      row.appendChild(mark);
    }
    var name = document.createElement("b");
    name.textContent = slot.name;
    name.style.cssText = "font-size:12px;line-height:1.2;min-width:0;overflow-wrap:anywhere;";
    row.appendChild(name);
    var line = document.createElement("div");
    line.textContent = slot.line;
    line.style.cssText = "font-size:11px;line-height:1.35;color:#eafff0;max-width:100%;overflow-wrap:anywhere;word-wrap:break-word;";
    var open = document.createElement("button");
    open.type = "button";
    open.textContent = "Abrir";
    open.style.cssText = "margin-top:4px;width:auto;padding:4px 8px;border-radius:999px;border:0;background:#34d17a;color:#053018;font-weight:800;font-size:11px;cursor:pointer;";
    open.addEventListener("click", function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      try {
        if (typeof root.openApp === "function") root.openApp(slot.app);
      } catch (eOpen) {}
    });
    aside.appendChild(tag);
    aside.appendChild(row);
    aside.appendChild(line);
    aside.appendChild(open);
  }

  var placedStage = null;

  function viewport(doc) {
    var de = doc.documentElement || {};
    var iw = root.innerWidth || 0;
    var ih = root.innerHeight || 0;
    var cw = de.clientWidth || 0;
    var ch = de.clientHeight || 0;
    return {
      vw: Math.min(iw || cw || 360, cw || iw || 360),
      vh: Math.min(ih || ch || 640, ch || ih || 640)
    };
  }

  function applyStage(stage, placed) {
    placedStage = stage;
    if (!placed) {
      stage.style.left = "";
      stage.style.top = "";
      stage.style.right = "";
      stage.style.bottom = "";
      stage.style.width = "";
      stage.style.height = "";
      return;
    }
    stage.style.right = "auto";
    stage.style.bottom = "auto";
    stage.style.left = placed.left + "px";
    stage.style.top = placed.top + "px";
    stage.style.width = placed.width + "px";
    stage.style.height = placed.height + "px";
  }

  function sync(doc, stage) {
    if (!doc || !stage || !stage.isConnected) {
      hide(doc);
      return null;
    }
    var view = viewport(doc);
    var hangEl = doc.getElementById("dcCallBanner");
    var measured = null;
    if (hangEl && hangEl.getBoundingClientRect) {
      var r = hangEl.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) {
        measured = { left: r.left, top: r.top, width: r.width, height: r.height };
      }
    }
    var placed = layout(view.vw, view.vh, stage.classList.contains("is-minimized"), measured);
    applyStage(stage, placed.moveStage ? placed.stage : null);
    var aside = doc.getElementById("dcCallAd");
    if (!aside) {
      aside = doc.createElement("aside");
      aside.id = "dcCallAd";
      aside.setAttribute("role", "complementary");
      aside.setAttribute("aria-label", "Publicidad de Doganiero");
      aside.style.position = "fixed";
      aside.style.zIndex = "11940";
      aside.style.boxSizing = "border-box";
      aside.style.overflow = "hidden";
      aside.style.padding = "8px";
      aside.style.borderRadius = "12px";
      aside.style.background = "rgba(8,24,16,.94)";
      aside.style.border = "1px solid rgba(52,209,122,.45)";
      aside.style.color = "#eafff0";
      aside.style.fontFamily = "inherit";
      doc.body.appendChild(aside);
      paint(aside);
      timer = root.setInterval(function () {
        index = (index + 1) % SLOTS.length;
        var node = doc.getElementById("dcCallAd");
        if (node) paint(node);
      }, 12000);
    }
    if (aside.parentNode === stage) doc.body.appendChild(aside);
    aside.style.right = "auto";
    aside.style.maxWidth = (view.vw - 32) + "px";
    aside.style.left = placed.ad.left + "px";
    aside.style.top = placed.ad.top + "px";
    aside.style.width = placed.ad.width + "px";
    aside.style.height = placed.ad.height + "px";
    aside.hidden = false;
    return placed;
  }

  function hide(doc) {
    if (timer) {
      root.clearInterval(timer);
      timer = null;
    }
    if (placedStage) {
      applyStage(placedStage, null);
      placedStage = null;
    }
    if (!doc) return;
    var aside = doc.getElementById("dcCallAd");
    if (aside && aside.parentNode) aside.parentNode.removeChild(aside);
  }

  return {
    SLOTS: SLOTS,
    stageBox: stageBox,
    layout: layout,
    overlaps: overlaps,
    controlsBox: controlsBox,
    hangupBox: hangupBox,
    wrapsInside: wrapsInside,
    sync: sync,
    hide: hide
  };
});
