
(function(){
  var T = SRA.T, dark = SRA.theme !== 'light';
  var bar = document.getElementById('bar'), name = document.getElementById('name'), st = document.getElementById('st');
  document.body.classList.toggle('dk', dark);
  var WELCOME = T('# Hola 👋\n\nEste es **Toast UI Editor**, un editor de *Markdown* de código abierto.\n\n- Escribe a la izquierda y mira el resultado a la derecha.\n- Cambia a **WYSIWYG** abajo para editar sin Markdown.\n- Todo se guarda solo en este perfil de Snake OS.\n\n| App | Licencia |\n| --- | --- |\n| Toast UI Editor | MIT |\n\n```js\nconsole.log("¡Hola desde Snake OS!");\n```\n',
                  '# Hello 👋\n\nThis is **Toast UI Editor**, an open-source *Markdown* editor.\n\n- Type on the left and see the result on the right.\n- Switch to **WYSIWYG** below to edit without Markdown.\n- Everything is saved automatically on this Snake OS profile.\n\n| App | Licence |\n| --- | --- |\n| Toast UI Editor | MIT |\n\n```js\nconsole.log("Hello from Snake OS!");\n```\n');
  var ed = null, timer = null, doc = { name: T('documento', 'document') + '.md', md: WELCOME };
  function save(){ clearTimeout(timer); if (!ed) return; doc.md = ed.getMarkdown(); doc.at = Date.now(); SRA.save('doc', { name: doc.name, md: doc.md, at: doc.at }); st.textContent = T('Guardado', 'Saved'); }
  SRA.onClose(save); window.addEventListener('pagehide', save);
  function btn(label, title, fn){ var b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.title = title; b.addEventListener('click', fn); bar.insertBefore(b, name); return b; }
  SRA.load('doc').then(null, function(){ return null; }).then(function(saved){
    if (saved && typeof saved.md === 'string') doc = saved;
    name.value = doc.name;
    var narrow = window.innerWidth < 700;
    ed = new toastui.Editor({
      el: document.getElementById('ed'), height: '100%', initialEditType: 'markdown', previewStyle: narrow ? 'tab' : 'vertical',
      initialValue: doc.md, language: SRA.en ? 'en-US' : 'es-ES', theme: dark ? 'dark' : 'light', usageStatistics: false, autofocus: !narrow,
      events: { change: function(){ st.textContent = T('Guardando…', 'Saving…'); clearTimeout(timer); timer = setTimeout(save, 700); } }
    });
    window.addEventListener('resize', function(){ ed.changePreviewStyle(window.innerWidth < 700 ? 'tab' : 'vertical'); });
    btn(T('Nuevo', 'New'), T('Documento nuevo', 'New document'), function(){
      if (!confirm(T('¿Empezar un documento nuevo? El actual se borrará de la app (guárdalo antes si lo quieres).', 'Start a new document? The current one will be removed from the app (save it first if you want it).'))) return;
      doc = { name: T('documento', 'document') + '.md', md: '' }; name.value = doc.name; ed.setMarkdown(''); save();
    });
    var inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.md,.markdown,.txt,text/markdown,text/plain'; inp.hidden = true; document.body.appendChild(inp);
    inp.addEventListener('change', function(){ var f = inp.files && inp.files[0]; if (!f) return; f.text().then(function(t){ doc.name = f.name; name.value = f.name; ed.setMarkdown(t); save(); }); inp.value = ''; });
    btn(T('Abrir…', 'Open…'), T('Abrir un archivo .md o .txt', 'Open a .md or .txt file'), function(){ inp.click(); });
    btn(T('Guardar .md', 'Save .md'), T('Descargar como Markdown', 'Download as Markdown'), function(){ save(); SRA.download(new Blob([ed.getMarkdown()], { type: 'text/markdown' }), (name.value || 'documento.md').replace(/(\.md)?$/i, '.md')); });
    btn(T('Exportar HTML', 'Export HTML'), T('Descargar como página web', 'Download as a web page'), function(){
      var t = (name.value || 'documento').replace(/\.md$/i, '');
      var html = '<!doctype html><html><head><meta charset="utf-8"><title>' + t.replace(/</g, '&lt;') + '</title></head><body>' + ed.getHTML() + '</body></html>';
      SRA.download(new Blob([html], { type: 'text/html' }), t + '.html');
    });
    name.addEventListener('change', function(){ doc.name = name.value.trim() || doc.name; save(); });
    st.textContent = saved ? T('Guardado', 'Saved') : '';
  });
})();
