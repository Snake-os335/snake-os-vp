/* Snake OS · preguntar a la placa. La respuesta llega por el puente del Mac. */
(function () {
  var css = document.createElement('style');
  css.textContent =
    '.ask-app{display:flex;flex-direction:column;gap:10px;height:100%;padding:14px;box-sizing:border-box;background:#07140d;color:#f4fff8;font-family:var(--snake-font,ui-sans-serif,system-ui,sans-serif);}' +
    '.ask-app h2{margin:0;font-size:1.2rem;}' +
    '.ask-logo{width:84px;height:84px;object-fit:contain;align-self:flex-start;}' +
    '.ask-app textarea{width:100%;box-sizing:border-box;min-height:72px;border:0;border-radius:12px;padding:10px;background:rgba(255,255,255,0.12);color:#fff;}' +
    '.ask-app button{border:0;border-radius:12px;padding:10px 14px;font-weight:700;background:#1f9e57;color:#fff;cursor:pointer;}' +
    '.ask-out{margin:0;white-space:pre-wrap;line-height:1.4;}';
  document.head.appendChild(css);


  function readJson(res) {
    return res.text().then(function (text) {
      var body = String(text || '').replace(/^\uFEFF/, '').trim();
      if (!body || body.charAt(0) === '<') throw new Error('La respuesta no era JSON.');
      try { return JSON.parse(body); }
      catch (e) { throw new Error('La respuesta no era JSON.'); }
    });
  }

  function renderAskApp(container) {
    container.innerHTML =
      '<div class="ask-app">' +
        '<img class="ask-logo" src="/static/assets/mega-logo.png" alt="Asistente">' +
        '<h2>Pregunta a la placa</h2>' +
        '<textarea data-ask="q" maxlength="140" placeholder="Escribe la pregunta"></textarea>' +
        '<button type="button" data-ask="go">Preguntar</button>' +
        '<p class="ask-out" data-ask="out"></p>' +
      '</div>';
    var input = container.querySelector('[data-ask=q]');
    var out = container.querySelector('[data-ask=out]');
    var go = container.querySelector('[data-ask=go]');
    var alive = true;
    var timer = 0;
    function stop() {
      if (timer) clearInterval(timer);
      timer = 0;
    }
    function ask() {
      var text = String(input.value || '').trim();
      if (text.length < 2) {
        out.textContent = 'Escribe una pregunta.';
        return;
      }
      stop();
      go.disabled = true;
      out.textContent = 'La placa esta pensando…';
      fetch('/api/board/ask', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({text: text.slice(0, 140)})
      }).then(readJson).then(function (data) {
        if (!data || !data.id) throw new Error('La respuesta no era JSON.');
        return data;
      }).then(function (data) {
        var tries = 0;
        timer = setInterval(function () {
          if (!alive) { stop(); return; }
          tries += 1;
          fetch('/api/board/ask/result?id=' + data.id, {cache: 'no-store', credentials: 'same-origin'})
            .then(readJson)
            .then(function (job) {
              if (job && job.status === 'done') {
                stop();
                go.disabled = false;
                out.textContent = job.reply || 'Sin respuesta.';
                if (job.call && (job.call.email || job.call.number) && typeof startDoganieroBoardCall === 'function') {
                  try { startDoganieroBoardCall(job.call); } catch (eCall) {}
                }
              } else if (tries > 80) {
                stop();
                go.disabled = false;
                out.textContent = 'La placa no contesto.';
              }
            })
            .catch(function () {});
        }, 500);
      }).catch(function (err) {
        go.disabled = false;
        out.textContent = (err && err.message) || 'No se pudo preguntar.';
      });
    }
    go.addEventListener('click', ask);
    input.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter' && !ev.shiftKey) {
        ev.preventDefault();
        ask();
      }
    });
    return function () {
      alive = false;
      stop();
    };
  }

  function install() {
    var apps = window.APPS;
    if (!apps) return false;
    apps.ask = {
      title: 'Asistente',
      iconImg: '/static/assets/mega-logo.png',
      iconImgClass: 'ai-logo',
      width: 420,
      height: 420,
      render: renderAskApp
    };
    try {
      if (typeof buildIcons === 'function') buildIcons();
      if (typeof buildStartMenu === 'function') buildStartMenu();
    } catch (e) {}
    return true;
  }

  window.renderAskApp = renderAskApp;
  if (!install()) {
    var tries = 0;
    var iv = setInterval(function () {
      if (install() || ++tries > 200) clearInterval(iv);
    }, 50);
  }
})();
