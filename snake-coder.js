(function () {

  function readJson(res) {
    return res.text().then(function (text) {
      var body = String(text || "").replace(/^\uFEFF/, "").trim();
      if (!body || body.charAt(0) === "<") throw new Error("La respuesta no era JSON.");
      try { return JSON.parse(body); }
      catch (e) { throw new Error("La respuesta no era JSON."); }
    });
  }

  window.renderCoderApp = function (body) {
    body.innerHTML = ''
      + '<div style="display:flex;flex-direction:column;height:100%;min-height:360px;gap:8px;padding:10px;box-sizing:border-box;color:#f4fff8">'
      + '<p style="margin:0;font-size:13px">Escribe lo que quieres. La placa programa la pagina.</p>'
      + '<textarea class="coder-text" style="height:72px;min-height:72px;width:100%;box-sizing:border-box"></textarea>'
      + '<button type="button" class="coder-go" style="margin-top:0;width:auto;align-self:flex-start">Programar</button>'
      + '<div class="coder-note" style="font-size:13px;min-height:1.2em"></div>'
      + '<iframe class="coder-page" title="Coder" style="flex:1;width:100%;border:1px solid #333;background:#fff;min-height:200px"></iframe>'
      + '</div>';
    var text = body.querySelector(".coder-text");
    var go = body.querySelector(".coder-go");
    var note = body.querySelector(".coder-note");
    var frame = body.querySelector(".coder-page");
    var timer = null;
    function stop() {
      if (timer) { clearInterval(timer); timer = null; }
    }
    function showPage(html) {
      frame.removeAttribute("src");
      frame.srcdoc = html;
    }
    go.addEventListener("click", function () {
      var value = text.value || "";
      if (!value.trim()) {
        note.textContent = "Escribe algo corto.";
        return;
      }
      go.disabled = true;
      note.textContent = "La placa esta programando.";
      showPage("");
      fetch("/api/coder/make", {
        method: "POST",
        credentials: "same-origin",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({text: value.slice(0, 140)})
      }).then(readJson).then(function (data) {
        if (!data || !data.id) throw new Error("La respuesta no era JSON.");
        return data;
      }).then(function (data) {
        var tries = 0;
        stop();
        timer = setInterval(function () {
          tries += 1;
          fetch("/api/coder/result?job=" + data.id, {credentials: "same-origin", cache: "no-store"})
            .then(readJson)
            .then(function (job) {
              if (job && job.status === "done" && job.html) {
                stop();
                go.disabled = false;
                note.textContent = "Pagina lista.";
                showPage(job.html);
              } else if (tries > 80) {
                stop();
                go.disabled = false;
                note.textContent = "La placa no respondio.";
              }
            })
            .catch(function () {});
        }, 500);
      }).catch(function (err) {
        go.disabled = false;
        note.textContent = (err && err.message) || "Error";
      });
    });
    return stop;
  };
})();
