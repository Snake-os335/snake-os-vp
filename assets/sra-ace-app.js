
(function(){
  var T = SRA.T, U = {"ace/mode/javascript": "sra-ace-mode-javascript.js", "ace/snippets/javascript": "sra-ace-snippets-javascript.js", "ace/mode/typescript": "sra-ace-mode-typescript.js", "ace/snippets/typescript": "sra-ace-snippets-typescript.js", "ace/mode/json": "sra-ace-mode-json.js", "ace/snippets/json": "sra-ace-snippets-json.js", "ace/mode/html": "sra-ace-mode-html.js", "ace/snippets/html": "sra-ace-snippets-html.js", "ace/mode/css": "sra-ace-mode-css.js", "ace/snippets/css": "sra-ace-snippets-css.js", "ace/mode/scss": "sra-ace-mode-scss.js", "ace/snippets/scss": "sra-ace-snippets-scss.js", "ace/mode/python": "sra-ace-mode-python.js", "ace/snippets/python": "sra-ace-snippets-python.js", "ace/mode/java": "sra-ace-mode-java.js", "ace/snippets/java": "sra-ace-snippets-java.js", "ace/mode/c_cpp": "sra-ace-mode-c_cpp.js", "ace/snippets/c_cpp": "sra-ace-snippets-c_cpp.js", "ace/mode/csharp": "sra-ace-mode-csharp.js", "ace/snippets/csharp": "sra-ace-snippets-csharp.js", "ace/mode/php": "sra-ace-mode-php.js", "ace/snippets/php": "sra-ace-snippets-php.js", "ace/mode/ruby": "sra-ace-mode-ruby.js", "ace/snippets/ruby": "sra-ace-snippets-ruby.js", "ace/mode/golang": "sra-ace-mode-golang.js", "ace/snippets/golang": "sra-ace-snippets-golang.js", "ace/mode/rust": "sra-ace-mode-rust.js", "ace/snippets/rust": "sra-ace-snippets-rust.js", "ace/mode/kotlin": "sra-ace-mode-kotlin.js", "ace/snippets/kotlin": "sra-ace-snippets-kotlin.js", "ace/mode/swift": "sra-ace-mode-swift.js", "ace/snippets/swift": "sra-ace-snippets-swift.js", "ace/mode/lua": "sra-ace-mode-lua.js", "ace/snippets/lua": "sra-ace-snippets-lua.js", "ace/mode/sh": "sra-ace-mode-sh.js", "ace/snippets/sh": "sra-ace-snippets-sh.js", "ace/mode/sql": "sra-ace-mode-sql.js", "ace/snippets/sql": "sra-ace-snippets-sql.js", "ace/mode/markdown": "sra-ace-mode-markdown.js", "ace/snippets/markdown": "sra-ace-snippets-markdown.js", "ace/mode/xml": "sra-ace-mode-xml.js", "ace/snippets/xml": "sra-ace-snippets-xml.js", "ace/mode/yaml": "sra-ace-mode-yaml.js", "ace/snippets/yaml": "sra-ace-snippets-yaml.js", "ace/mode/dockerfile": "sra-ace-mode-dockerfile.js", "ace/snippets/dockerfile": "sra-ace-snippets-dockerfile.js", "ace/mode/ini": "sra-ace-mode-ini.js", "ace/snippets/ini": "sra-ace-snippets-ini.js", "ace/mode/batchfile": "sra-ace-mode-batchfile.js", "ace/snippets/batchfile": "sra-ace-snippets-batchfile.js", "ace/mode/text": "sra-ace-mode-text.js", "ace/snippets/text": "sra-ace-snippets-text.js", "ace/mode/jsx": "sra-ace-mode-jsx.js", "ace/snippets/jsx": "sra-ace-snippets-jsx.js", "ace/mode/tsx": "sra-ace-mode-tsx.js", "ace/snippets/tsx": "sra-ace-snippets-tsx.js", "ace/theme/monokai": "sra-ace-theme-monokai.js", "ace/theme/tomorrow_night": "sra-ace-theme-tomorrow_night.js", "ace/theme/dracula": "sra-ace-theme-dracula.js", "ace/theme/one_dark": "sra-ace-theme-one_dark.js", "ace/theme/github": "sra-ace-theme-github.js", "ace/theme/chrome": "sra-ace-theme-chrome.js", "ace/theme/solarized_light": "sra-ace-theme-solarized_light.js", "ace/ext/language_tools": "sra-ace-ext-language_tools.js", "ace/ext/searchbox": "sra-ace-ext-searchbox.js", "ace/ext/beautify": "sra-ace-ext-beautify.js", "ace/ext/statusbar": "sra-ace-ext-statusbar.js", "ace/ext/keybinding_menu": "sra-ace-ext-keybinding_menu.js", "ace/ext/prompt": "sra-ace-ext-prompt.js", "ace/mode/javascript_worker": "sra-ace-worker-javascript.js", "ace/mode/json_worker": "sra-ace-worker-json.js", "ace/mode/html_worker": "sra-ace-worker-html.js", "ace/mode/css_worker": "sra-ace-worker-css.js", "ace/mode/php_worker": "sra-ace-worker-php.js", "ace/mode/xml_worker": "sra-ace-worker-xml.js", "ace/mode/yaml_worker": "sra-ace-worker-yaml.js", "ace/mode/lua_worker": "sra-ace-worker-lua.js"}, LANGS = {"javascript": "JavaScript", "typescript": "TypeScript", "json": "JSON", "html": "HTML", "css": "CSS", "scss": "SCSS", "python": "Python", "java": "Java", "c_cpp": "C / C++", "csharp": "C#", "php": "PHP", "ruby": "Ruby", "golang": "Go", "rust": "Rust", "kotlin": "Kotlin", "swift": "Swift", "lua": "Lua", "sh": "Bash", "sql": "SQL", "markdown": "Markdown", "xml": "XML", "yaml": "YAML", "dockerfile": "Dockerfile", "ini": "INI", "batchfile": "Batch", "text": "Texto", "jsx": "JSX", "tsx": "TSX"}, EXT = {"js": "javascript", "mjs": "javascript", "cjs": "javascript", "ts": "typescript", "json": "json", "html": "html", "htm": "html", "css": "css", "scss": "scss", "py": "python", "java": "java", "c": "c_cpp", "h": "c_cpp", "cpp": "c_cpp", "cc": "c_cpp", "hpp": "c_cpp", "cs": "csharp", "php": "php", "rb": "ruby", "go": "golang", "rs": "rust", "kt": "kotlin", "swift": "swift", "lua": "lua", "sh": "sh", "bash": "sh", "sql": "sql", "md": "markdown", "xml": "xml", "svg": "xml", "yml": "yaml", "yaml": "yaml", "ini": "ini", "toml": "ini", "bat": "batchfile", "cmd": "batchfile", "txt": "text", "jsx": "jsx", "tsx": "tsx"};
  Object.keys(U).forEach(function(k){ ace.config.setModuleUrl(k, '/static/assets/' + U[k] + '?v=' + SRA.ver); });
  ace.config.set('loadWorkerFromBlob', false);
  ace.config.set('useStrictCSP', false);
  var dark = SRA.theme !== 'light';
  var $ = function(s){ return document.querySelector(s); };
  var tabsEl = $('#tabs'), langSel = $('#lang'), themeSel = $('#theme'), st = $('#st');
  Object.keys(LANGS).forEach(function(k){ var o = document.createElement('option'); o.value = k; o.textContent = k === 'text' ? T('Texto', 'Plain text') : LANGS[k]; langSel.appendChild(o); });
  [['monokai','Monokai'],['tomorrow_night','Tomorrow Night'],['dracula','Dracula'],['one_dark','One Dark'],['github','GitHub'],['chrome','Chrome'],['solarized_light','Solarized Light']].forEach(function(t){ var o = document.createElement('option'); o.value = t[0]; o.textContent = t[1]; themeSel.appendChild(o); });
  ace.require('ace/ext/language_tools');
  var ed = ace.edit('ed'), EditSession = ace.require('ace/edit_session').EditSession, UndoManager = ace.require('ace/undomanager').UndoManager;
  ed.setOptions({ enableBasicAutocompletion: true, enableLiveAutocompletion: true, enableSnippets: true, showPrintMargin: false, fontSize: '14px', tabSize: 2, useSoftTabs: true, scrollPastEnd: 0.4 });
  var state = { files: [], cur: 0, theme: dark ? 'one_dark' : 'github', size: 14 }, sessions = [], timer = null;
  function modeFor(name){ var m = /\.([a-z0-9]+)$/i.exec(name || ''); return (m && EXT[m[1].toLowerCase()]) || 'text'; }
  function save(){ clearTimeout(timer); sessions.forEach(function(s, i){ if (state.files[i]) state.files[i].text = s.getValue(); }); SRA.save('files', { files: state.files, cur: state.cur, theme: state.theme, size: state.size, at: Date.now() }); st.textContent = T('Guardado', 'Saved'); }
  SRA.onClose(save); window.addEventListener('pagehide', save);
  function mk(f){ var s = new EditSession(f.text || ''); s.setMode('ace/mode/' + (f.mode || modeFor(f.name))); s.setUndoManager(new UndoManager()); s.on('change', function(){ st.textContent = T('Guardando…', 'Saving…'); clearTimeout(timer); timer = setTimeout(save, 800); }); return s; }
  function paint(){
    tabsEl.innerHTML = '';
    state.files.forEach(function(f, i){
      var t = document.createElement('div'); t.className = 'tab' + (i === state.cur ? ' on' : ''); t.title = f.name;
      var n = document.createElement('span'); n.textContent = f.name; t.appendChild(n);
      var x = document.createElement('b'); x.textContent = '×'; x.title = T('Cerrar', 'Close'); t.appendChild(x);
      t.addEventListener('click', function(e){ if (e.target === x) return close(i); show(i); });
      n.addEventListener('dblclick', function(){ var nn = prompt(T('Nuevo nombre del archivo:', 'New file name:'), f.name); if (nn && nn.trim()) { f.name = nn.trim(); f.mode = modeFor(f.name); sessions[i].setMode('ace/mode/' + f.mode); paint(); save(); } });
      tabsEl.appendChild(t);
    });
    var f = state.files[state.cur]; if (f) langSel.value = f.mode || modeFor(f.name);
  }
  function show(i){ state.cur = i; ed.setSession(sessions[i]); paint(); ed.focus(); }
  function add(f){ state.files.push(f); sessions.push(mk(f)); show(state.files.length - 1); save(); }
  function close(i){ var f = state.files[i]; if (!confirm(T('¿Cerrar «' + f.name + '»? Se quita de la app (descárgalo antes si lo quieres).', 'Close “' + f.name + '”? It is removed from the app (download it first if you want it).'))) return;
    state.files.splice(i, 1); sessions.splice(i, 1); if (!state.files.length) { add({ name: 'nuevo.txt', text: '' }); return; } show(Math.min(i, state.files.length - 1)); save(); }
  function setTheme(t){ state.theme = t; themeSel.value = t; ed.setTheme('ace/theme/' + t); var light = /github|chrome|solarized_light/.test(t); document.body.classList.toggle('lt', light); }
  function setSize(n){ state.size = Math.max(10, Math.min(28, n)); ed.setFontSize(state.size + 'px'); }
  $('#new').addEventListener('click', function(){ var n = prompt(T('Nombre del archivo nuevo (con extensión, p. ej. app.js):', 'New file name (with extension, e.g. app.js):'), 'nuevo.js'); if (n && n.trim()) add({ name: n.trim(), text: '' }); });
  var inp = $('#file');
  inp.addEventListener('change', function(){ Array.prototype.forEach.call(inp.files || [], function(f){ f.text().then(function(t){ add({ name: f.name, text: t }); }); }); inp.value = ''; });
  $('#open').addEventListener('click', function(){ inp.click(); });
  $('#dl').addEventListener('click', function(){ var f = state.files[state.cur]; if (!f) return; SRA.download(new Blob([ed.getValue()], { type: 'text/plain' }), f.name); });
  $('#find').addEventListener('click', function(){ ed.execCommand('find'); });
  $('#fmt').addEventListener('click', function(){ try { ace.require('ace/ext/beautify').beautify(ed.session); } catch (e) {} });
  $('#minus').addEventListener('click', function(){ setSize(state.size - 1); save(); });
  $('#plus').addEventListener('click', function(){ setSize(state.size + 1); save(); });
  langSel.addEventListener('change', function(){ var f = state.files[state.cur]; f.mode = langSel.value; sessions[state.cur].setMode('ace/mode/' + f.mode); save(); });
  themeSel.addEventListener('change', function(){ setTheme(themeSel.value); save(); });
  ed.commands.addCommand({ name: 'sraSave', bindKey: { win: 'Ctrl-S', mac: 'Command-S' }, exec: function(){ save(); } });
  ed.on('changeSelection', function(){ var c = ed.getCursorPosition(); $('#pos').textContent = T('Lín ', 'Ln ') + (c.row + 1) + ', Col ' + (c.column + 1); });
  SRA.load('files').then(null, function(){ return null; }).then(function(saved){
    if (saved && saved.files && saved.files.length) { state.files = saved.files; state.cur = Math.min(saved.cur || 0, saved.files.length - 1); state.theme = saved.theme || state.theme; state.size = saved.size || 14; }
    else state.files = [{ name: 'hola.js', text: T('// Bienvenido a Ace, el editor de código de Cloud9 y GitHub.\n// Abre archivos, crea pestañas y descárgalos cuando quieras.\n// Todo se guarda solo en este perfil de Snake OS.\n\nfunction saludar(nombre) {\n  return `¡Hola, ${nombre}! 🐍`;\n}\n\nconsole.log(saludar("Snake OS"));\n', '// Welcome to Ace, the code editor behind Cloud9 and GitHub.\n// Open files, create tabs and download them whenever you want.\n// Everything is saved automatically on this Snake OS profile.\n\nfunction greet(name) {\n  return `Hello, ${name}! 🐍`;\n}\n\nconsole.log(greet("Snake OS"));\n') },
                           { name: 'estilos.css', text: 'body {\n  background: #0b1a12;\n  color: #34d17a;\n  font-family: Inter, sans-serif;\n}\n' },
                           { name: 'main.py', text: 'def fib(n):\n    a, b = 0, 1\n    for _ in range(n):\n        a, b = b, a + b\n    return a\n\nprint([fib(i) for i in range(10)])\n' }];
    sessions = state.files.map(mk);
    setTheme(state.theme); setSize(state.size); show(state.cur);
    st.textContent = saved ? T('Guardado', 'Saved') : '';
  });
  document.querySelectorAll('[data-t]').forEach(function(b){ var p = b.getAttribute('data-t').split('|'); b.textContent = T(p[0], p[1]); });
  document.querySelectorAll('[data-ti]').forEach(function(b){ var p = b.getAttribute('data-ti').split('|'); b.title = T(p[0], p[1]); });
})();
