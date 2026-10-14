/* ===== Snake OS Terminal (v2026.11): comandos tipo Linux sobre Snake OS ===== */
(function(){
  if(window.SnakeTerminal) return;
  var BOOT = Date.now();
  var VERSION = '2026.11', KERNEL = 'Doganiero OS! 3';
  function B(){ return window.SnakeTermBridge; }
  function user(){ return (B() && B().user()) || null; }
  function uname(){
    var u = user(); if(!u) return 'invitado';
    var n = String(u.name || u.username || u.email || 'usuario').split('@')[0].toLowerCase().replace(/\s+/g,'');
    return n || 'usuario';
  }
  function homeArr(){ return ['home', uname()]; }
  var cwd = null;
  function getCwd(){ if(!cwd) cwd = homeArr(); return cwd; }
  function fmtPath(a){
    var h = homeArr();
    if(a.length >= 2 && a[0]===h[0] && a[1]===h[1]) return '~' + (a.length>2 ? '/' + a.slice(2).join('/') : '');
    return '/' + a.join('/');
  }
  function prompt(){ return uname() + '@snake-os:' + fmtPath(getCwd()) + '$'; }
  function resolve(p){
    p = String(p == null ? '' : p);
    var base;
    if(p === '' ) return getCwd().slice();
    if(p.charAt(0) === '~'){ base = homeArr(); p = p.slice(1); }
    else if(p.charAt(0) === '/'){ base = []; }
    else base = getCwd().slice();
    p.split('/').forEach(function(s){
      if(!s || s === '.') return;
      if(s === '..'){ base.pop(); return; }
      base.push(s);
    });
    return base;
  }
  /* ---- Modelo de archivos ---- */
  function isKeep(n){ return /(^|\/)\.keep$/.test(n); }
  function files(){ return (B() && B().files()) || []; }
  function notes(){ return (B() && B().notes()) || []; }
  function inHome(a){ var h = homeArr(); return a.length >= 2 && a[0]===h[0] && a[1]===h[1]; }
  function isNotes(a){ return inHome(a) && a[2] === 'Notas'; }
  function rel(a){ return a.slice(2).join('/'); }
  function noteIdx(name){ var m = /^nota-(\d+)\.txt$/.exec(name || ''); return m ? parseInt(m[1],10)-1 : -1; }
  function apps(){ return (B() && B().apps()) || {}; }
  function etcFiles(){
    return {
      'hostname': 'snake-os',
      'os-release': 'NAME="Snake OS"\nVERSION="' + VERSION + '"\nID=snake-os\nPRETTY_NAME="Snake OS ' + VERSION + '"\nKERNEL="' + KERNEL + '"\nVENDOR="Doganiero OS!"',
      'motd': 'Bienvenido a Snake OS ' + VERSION + ' (' + KERNEL + ')'
    };
  }
  function procFiles(){
    return { 'uptime': uptimeStr(), 'version': 'Snake OS ' + VERSION + ' · kernel ' + KERNEL };
  }
  // stat: {type:'dir'|'file', kind, entry?, idx?, ro?}
  function stat(a){
    if(a.length === 0) return { type:'dir' };
    var t = a[0];
    if(t === 'home'){
      if(a.length === 1) return { type:'dir', ro:true };
      if(a[1] !== uname()) return null;
      if(a.length === 2) return { type:'dir' };
      if(a[2] === 'Notas'){
        if(a.length === 3) return { type:'dir', ro:true, kind:'notesdir' };
        if(a.length !== 4) return null;
        var i = noteIdx(a[3]);
        if(i >= 0 && i < notes().length) return { type:'file', kind:'note', idx:i };
        return null;
      }
      var r = rel(a), fs = files();
      for(var k=0;k<fs.length;k++){ if(fs[k].name === r) return { type:'file', kind:'home', entry:fs[k] }; }
      for(var j=0;j<fs.length;j++){ if(String(fs[j].name).indexOf(r + '/') === 0) return { type:'dir', kind:'homedir' }; }
      return null;
    }
    if(t === 'apps'){
      if(a.length === 1) return { type:'dir', ro:true };
      if(a.length === 2 && apps()[a[1]]) return { type:'file', kind:'app', ro:true };
      return null;
    }
    if(t === 'etc' || t === 'proc'){
      var m = t === 'etc' ? etcFiles() : procFiles();
      if(a.length === 1) return { type:'dir', ro:true };
      if(a.length === 2 && m[a[1]] != null) return { type:'file', kind:t, ro:true };
      return null;
    }
    return null;
  }
  function list(a){ // nombres (dirs terminan en '/')
    if(a.length === 0) return ['apps/','etc/','home/','proc/'];
    if(a[0] === 'home' && a.length === 1) return [uname() + '/'];
    if(a[0] === 'apps') return Object.keys(apps()).sort();
    if(a[0] === 'etc') return Object.keys(etcFiles());
    if(a[0] === 'proc') return Object.keys(procFiles());
    if(isNotes(a)) return notes().map(function(n,i){ return 'nota-' + (i+1) + '.txt'; });
    var r = rel(a), pre = r ? r + '/' : '', seen = {}, outl = [];
    if(!r) { seen['Notas/'] = 1; outl.push('Notas/'); }
    files().forEach(function(f){
      var n = String(f.name);
      if(pre && n.indexOf(pre) !== 0) return;
      var rest = n.slice(pre.length), sl = rest.indexOf('/');
      var item = sl >= 0 ? rest.slice(0, sl) + '/' : rest;
      if(item === '.keep' || seen[item]) return;
      seen[item] = 1; outl.push(item);
    });
    return outl.sort();
  }
  function decode(du){
    du = String(du || ''); var c = du.indexOf(','); if(c < 0) return '';
    var head = du.slice(0, c), body = du.slice(c+1);
    try{
      if(/;base64/i.test(head)){
        var bin = atob(body), bytes = new Uint8Array(bin.length);
        for(var i=0;i<bin.length;i++) bytes[i] = bin.charCodeAt(i);
        return new TextDecoder('utf-8').decode(bytes);
      }
      return decodeURIComponent(body);
    }catch(e){ return ''; }
  }
  function encode(text){
    var bytes = new TextEncoder().encode(String(text)), s = '';
    for(var i=0;i<bytes.length;i++) s += String.fromCharCode(bytes[i]);
    return 'data:text/plain;base64,' + btoa(s);
  }
  function isBinary(e){ var t = String(e.type || ''); return t && !/^text\/|json|javascript|xml|csv|^application\/octet-stream$/.test(t) && !/\.(txt|md|js|py|html|css|json|csv|sh|log)$/i.test(e.name); }
  function readText(a){
    var s = stat(a);
    if(!s) return Promise.reject(new Error(fmtPath(a) + ': No existe el archivo o el directorio'));
    if(s.type === 'dir') return Promise.reject(new Error(fmtPath(a) + ': Es un directorio'));
    if(s.kind === 'note') return Promise.resolve(String(notes()[s.idx].text || ''));
    if(s.kind === 'app'){ var ap = apps()[a[1]]; return Promise.resolve((ap.title || a[1]) + '\nid: ' + a[1] + '\nUsa: open ' + a[1]); }
    if(s.kind === 'etc') return Promise.resolve(etcFiles()[a[1]]);
    if(s.kind === 'proc') return Promise.resolve(procFiles()[a[1]]);
    if(isBinary(s.entry)) return Promise.reject(new Error(fmtPath(a) + ': archivo binario (' + (s.entry.type || '?') + '), ábrelo con open'));
    return Promise.resolve(B().readData(s.entry)).then(decode);
  }
  function writeText(a, text){
    var b = B();
    if(isNotes(a) && a.length === 4){
      var i = noteIdx(a[3]), ns = notes();
      if(i >= 0 && i < ns.length){ ns[i].text = text; }
      else ns.push({ id: Date.now() + '-' + Math.random().toString(36).slice(2), text: text, date: new Date().toLocaleString('es-ES') });
      return Promise.resolve(b.saveNotes()).then(function(){ b.rerender('notes'); });
    }
    if(!inHome(a) || a.length < 3 || a[2] === 'Notas') return Promise.reject(new Error(fmtPath(a) + ': Permiso denegado (solo lectura)'));
    var r = rel(a);
    var parent = a.slice(0, -1), ps = stat(parent);
    if(!ps || ps.type !== 'dir') return Promise.reject(new Error(fmtPath(parent) + ': No existe el directorio'));
    var s = stat(a);
    if(s && s.type === 'dir') return Promise.reject(new Error(fmtPath(a) + ': Es un directorio'));
    var du = encode(text), entry;
    if(s){ entry = s.entry; entry.dataUrl = du; entry.size = du.length; entry.type = entry.type || 'text/plain'; }
    else { entry = { id: b.newFileId(), name: r, type: 'text/plain', dataUrl: du, size: du.length }; files().push(entry); }
    return Promise.resolve(b.upload(entry)).then(function(){ return b.persistFiles(); }).then(function(){ b.refresh(); });
  }
  function removeEntryNoTrash(entry){
    var fs = files(), i = fs.indexOf(entry); if(i >= 0) fs.splice(i, 1);
  }
  /* ---- Utilidades ---- */
  function uptimeStr(){
    var s = Math.floor((Date.now() - BOOT)/1000), h = Math.floor(s/3600), m = Math.floor((s%3600)/60);
    return new Date().toLocaleTimeString('es-ES') + ' activo ' + (h ? h + ' h ' : '') + m + ' min, 1 usuario';
  }
  function tokenize(line){
    var toks = [], cur = '', q = null, has = false;
    for(var i=0;i<line.length;i++){
      var c = line.charAt(i);
      if(q){ if(c === q) q = null; else cur += c; continue; }
      if(c === '"' || c === "'"){ q = c; has = true; continue; }
      if(c === '\\' && i+1 < line.length){ cur += line.charAt(++i); has = true; continue; }
      if(/\s/.test(c)){ if(cur || has){ toks.push(cur); cur=''; has=false; } continue; }
      if(c === '|' ){ if(cur||has){toks.push(cur);cur='';has=false;} toks.push({op:'|'}); continue; }
      if(c === '>'){ if(cur||has){toks.push(cur);cur='';has=false;} if(line.charAt(i+1)==='>'){ toks.push({op:'>>'}); i++; } else toks.push({op:'>'}); continue; }
      cur += c;
    }
    if(cur || has) toks.push(cur);
    return toks;
  }
  function flags(args){
    var f = {}, rest = [];
    args.forEach(function(x){ if(/^-[a-zA-Z]+$/.test(x)) x.slice(1).split('').forEach(function(c){ f[c]=1; }); else rest.push(x); });
    return { f:f, a:rest };
  }
  function globRe(p){ return new RegExp('^' + String(p).replace(/[.+^${}()|[\]\\]/g,'\\$&').replace(/\*/g,'.*').replace(/\?/g,'.') + '$', 'i'); }
  function walk(a, cb, depth){
    depth = depth || 0; if(depth > 12) return;
    list(a).forEach(function(n){
      var d = /\/$/.test(n), nm = d ? n.slice(0,-1) : n, ch = a.concat([nm]);
      cb(ch, d, depth);
      if(d) walk(ch, cb, depth+1);
    });
  }
  function err(m){ var e = new Error(m); return Promise.reject(e); }
  function appMatch(q){
    q = String(q || '').toLowerCase(); var A = apps();
    if(A[q]) return q;
    var ks = Object.keys(A);
    for(var i=0;i<ks.length;i++){ if(String(A[ks[i]].title || '').toLowerCase() === q) return ks[i]; }
    for(var j=0;j<ks.length;j++){ if(String(A[ks[j]].title || '').toLowerCase().indexOf(q) >= 0) return ks[j]; }
    return null;
  }
  /* ---- Ayuda ---- */
  var HELP = {
    help:'help — muestra los comandos', ls:'ls [-l] [-a] [ruta] — lista archivos', cd:'cd [ruta] — cambia de carpeta (cd, cd .., cd ~)',
    pwd:'pwd — muestra la carpeta actual', cat:'cat <archivo...> — muestra el contenido', echo:'echo <texto> [> archivo | >> archivo] — escribe texto',
    touch:'touch <archivo> — crea un archivo vacío', mkdir:'mkdir [-p] <carpeta> — crea una carpeta', rm:'rm [-r] <ruta> — envía a la Papelera (las notas se borran)',
    rmdir:'rmdir <carpeta> — borra una carpeta vacía', mv:'mv <origen> <destino> — mueve o renombra', cp:'cp <origen> <destino> — copia un archivo',
    head:'head [-n N] <archivo> — primeras líneas', tail:'tail [-n N] <archivo> — últimas líneas', grep:'grep [-i] [-n] <texto> [archivo...] — busca texto',
    find:'find [ruta] [-name patrón] — busca archivos', wc:'wc <archivo> — cuenta líneas, palabras y caracteres', tree:'tree [ruta] — árbol de carpetas',
    clear:'clear — limpia la pantalla', history:'history — comandos anteriores (también flechas ↑ ↓)', whoami:'whoami — tu perfil', hostname:'hostname — nombre del equipo',
    date:'date — fecha y hora', uname:'uname [-a] — sistema y kernel', uptime:'uptime — tiempo encendido', ps:'ps — apps abiertas', kill:'kill <app> — cierra una app',
    open:'open <app|archivo> — abre una app o un archivo', neofetch:'neofetch — información del sistema', nano:'nano <archivo> — editor (Ctrl+S guarda, Esc sale)',
    edit:'edit <archivo> — igual que nano', man:'man <comando> — ayuda de un comando', exit:'exit — cierra la Terminal',
    ssh:'ssh <host> — conexión SSH (hosts para ver la lista)', placa:'placa <texto> — envía texto a la placa Arduino'
  };
  var CMDS = Object.keys(HELP).concat(['hosts','connect']);
  /* ---- Comandos ---- */
  var C = {};
  C.help = function(){ var o = ['Comandos de Snake OS ' + VERSION + ':']; Object.keys(HELP).forEach(function(k){ o.push('  ' + HELP[k]); }); o.push('Carpetas: ~ (tus archivos del Explorador), ~/Notas (tus notas), /apps, /etc, /proc. Tab autocompleta.'); return o; };
  C.ayuda = C.help;
  C.man = function(args){ if(!args[0]) return err('¿Qué página quieres? Ej: man ls'); var h = HELP[args[0]]; if(!h) return err('No hay entrada de manual para ' + args[0]); return ['NOMBRE', '  ' + h]; };
  C.pwd = function(){ return ['/' + getCwd().join('/')]; };
  C.cd = function(args){
    var a = args[0] ? resolve(args[0]) : homeArr(), s = stat(a);
    if(!s) return err('cd: ' + args[0] + ': No existe el archivo o el directorio');
    if(s.type !== 'dir') return err('cd: ' + args[0] + ': No es un directorio');
    cwd = a; return [];
  };
  C.ls = function(args){
    var p = flags(args), targets = p.a.length ? p.a : [''], o = [];
    targets.forEach(function(t){
      var a = resolve(t), s = stat(a);
      if(!s){ o.push('ls: ' + t + ': No existe el archivo o el directorio'); return; }
      var items = s.type === 'dir' ? list(a) : [a[a.length-1]];
      if(p.f.a && s.type === 'dir') items = ['./','../'].concat(items);
      if(targets.length > 1) o.push(t + ':');
      if(p.f.l){
        items.forEach(function(n){
          var d = /\/$/.test(n), nm = d ? n.slice(0,-1) : n, size = 0, ro = false;
          if(s.type === 'dir' && nm !== '.' && nm !== '..'){ var st = stat(a.concat([nm])) || {}; ro = !!st.ro || !inHome(a); if(st.entry) size = st.entry.size || 0; if(st.kind === 'note') size = String(notes()[st.idx].text||'').length; }
          o.push((d ? 'd' : '-') + (ro ? 'r--r--r--' : 'rw-r--r--') + ' ' + uname() + ' ' + String(size).padStart(8) + ' ' + n);
        });
      } else if(items.length) o.push(items.join('  '));
    });
    return o;
  };
  C.cat = function(args, stdin){
    if(!args.length) return stdin != null ? stdin.split('\n') : err('cat: falta el archivo');
    var res = []; return args.reduce(function(pr, f){ return pr.then(function(){ return readText(resolve(f)).then(function(t){ res.push(t); }); }); }, Promise.resolve()).then(function(){ return res.join('\n').split('\n'); });
  };
  C.echo = function(args){ return [args.join(' ')]; };
  C.touch = function(args){
    if(!args.length) return err('touch: falta el archivo');
    return args.reduce(function(pr, f){ return pr.then(function(){ var a = resolve(f); if(stat(a)) return; return writeText(a, ''); }); }, Promise.resolve()).then(function(){ return []; });
  };
  C.mkdir = function(args){
    var p = flags(args); if(!p.a.length) return err('mkdir: falta la carpeta');
    var b = B();
    return p.a.reduce(function(pr, d){ return pr.then(function(){
      var a = resolve(d);
      if(stat(a)){ if(p.f.p) return; throw new Error('mkdir: ' + d + ': Ya existe'); }
      if(!inHome(a) || a.length < 3 || a[2] === 'Notas') throw new Error('mkdir: ' + d + ': Permiso denegado');
      var par = stat(a.slice(0,-1)); if(!par && !p.f.p) throw new Error('mkdir: ' + d + ': No existe la carpeta superior (usa -p)');
      var e = { id: b.newFileId(), name: rel(a) + '/.keep', type: 'text/plain', dataUrl: 'data:text/plain;base64,', size: 0 };
      files().push(e);
      return Promise.resolve(b.upload(e)).then(function(){ return b.persistFiles(); });
    }); }, Promise.resolve()).then(function(){ b.refresh(); return []; });
  };
  function trashPath(a, recursive){
    var b = B(), s = stat(a);
    if(!s) throw new Error(fmtPath(a) + ': No existe el archivo o el directorio');
    if(s.kind === 'note'){ notes().splice(s.idx, 1); return Promise.resolve(b.saveNotes()).then(function(){ b.rerender('notes'); }); }
    if(!inHome(a) || a.length < 3 || s.ro) throw new Error(fmtPath(a) + ': Permiso denegado');
    if(s.type === 'file'){ b.trash(s.entry.id); return Promise.resolve(); }
    if(!recursive) throw new Error(fmtPath(a) + ': Es un directorio (usa -r)');
    var pre = rel(a) + '/';
    files().filter(function(f){ return String(f.name).indexOf(pre) === 0; }).forEach(function(f){
      if(isKeep(f.name)) removeEntryNoTrash(f); else b.trash(f.id);
    });
    return Promise.resolve(b.persistFiles()).then(function(){ b.refresh(); });
  }
  C.rm = function(args){
    var p = flags(args); if(!p.a.length) return err('rm: falta la ruta');
    return p.a.reduce(function(pr, f){ return pr.then(function(){ return trashPath(resolve(f), p.f.r || p.f.R); }); }, Promise.resolve()).then(function(){ return []; });
  };
  C.rmdir = function(args){
    if(!args.length) return err('rmdir: falta la carpeta');
    var b = B();
    return args.reduce(function(pr, d){ return pr.then(function(){
      var a = resolve(d), s = stat(a);
      if(!s || s.type !== 'dir') throw new Error('rmdir: ' + d + ': No es un directorio');
      if(!inHome(a) || a.length < 3 || s.ro) throw new Error('rmdir: ' + d + ': Permiso denegado');
      if(list(a).length) throw new Error('rmdir: ' + d + ': El directorio no está vacío');
      var k = rel(a) + '/.keep';
      files().filter(function(f){ return f.name === k; }).forEach(removeEntryNoTrash);
      return Promise.resolve(b.persistFiles()).then(function(){ b.refresh(); });
    }); }, Promise.resolve()).then(function(){ return []; });
  };
  function destFor(src, dst){ var d = resolve(dst), s = stat(d); if(s && s.type === 'dir') d = d.concat([src[src.length-1]]); return d; }
  C.cp = function(args){
    var p = flags(args); if(p.a.length < 2) return err('cp: uso: cp <origen> <destino>');
    var src = resolve(p.a[0]), dst = destFor(src, p.a[1]);
    return readText(src).then(function(t){ return writeText(dst, t); }).then(function(){ return []; });
  };
  C.mv = function(args){
    if(args.length < 2) return err('mv: uso: mv <origen> <destino>');
    var b = B(), src = resolve(args[0]), s = stat(src), dst = destFor(src, args[1]);
    if(!s) return err('mv: ' + args[0] + ': No existe');
    if(stat(dst)) return err('mv: ' + args[1] + ': Ya existe');
    if(s.kind === 'home' && inHome(dst) && dst.length > 2 && dst[2] !== 'Notas'){
      if(!stat(dst.slice(0,-1))) return err('mv: no existe la carpeta de destino');
      s.entry.name = rel(dst);
      return Promise.resolve(b.persistFiles()).then(function(){ b.refresh(); return []; });
    }
    if(s.kind === 'homedir' && inHome(dst) && dst.length > 2 && dst[2] !== 'Notas'){
      var pre = rel(src) + '/', np = rel(dst) + '/';
      if(np.indexOf(pre) === 0) return err('mv: no se puede mover una carpeta dentro de sí misma');
      files().forEach(function(f){ if(String(f.name).indexOf(pre) === 0) f.name = np + String(f.name).slice(pre.length); });
      return Promise.resolve(b.persistFiles()).then(function(){ b.refresh(); return []; });
    }
    if(s.type !== 'file') return err('mv: no se puede mover ' + args[0]);
    return readText(src).then(function(t){ return writeText(dst, t); }).then(function(){ return trashPath(src); }).then(function(){ return []; });
  };
  function nArg(p, args){ var n = 10, rest = []; for(var i=0;i<args.length;i++){ if(args[i] === '-n' && args[i+1]){ n = parseInt(args[++i],10)||10; } else if(/^-\d+$/.test(args[i])) n = parseInt(args[i].slice(1),10); else rest.push(args[i]); } return { n:n, a:rest }; }
  function inputText(files_, stdin){ if(!files_.length) return stdin != null ? Promise.resolve(stdin) : err('falta el archivo'); return C.cat(files_).then(function(l){ return l.join('\n'); }); }
  C.head = function(args, stdin){ var p = nArg(null, args); return inputText(p.a, stdin).then(function(t){ return t.split('\n').slice(0, p.n); }); };
  C.tail = function(args, stdin){ var p = nArg(null, args); return inputText(p.a, stdin).then(function(t){ var l = t.split('\n'); return l.slice(Math.max(0, l.length - p.n)); }); };
  C.wc = function(args, stdin){ var p = flags(args); return inputText(p.a, stdin).then(function(t){ var l = t ? t.split('\n').length : 0, w = (t.match(/\S+/g)||[]).length; return ['  ' + l + '  ' + w + '  ' + t.length + (p.a[0] ? ' ' + p.a[0] : '')]; }); };
  C.grep = function(args, stdin){
    var p = flags(args); if(!p.a.length) return err('grep: falta el texto a buscar');
    var pat = p.a[0], fl = p.a.slice(1), re;
    try{ re = new RegExp(pat, p.f.i ? 'i' : ''); }catch(e){ re = new RegExp(pat.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'), p.f.i ? 'i' : ''); }
    if(!fl.length){ if(stdin == null) return err('grep: falta el archivo'); return stdin.split('\n').filter(function(x){ return re.test(x); }); }
    var o = [];
    return fl.reduce(function(pr, f){ return pr.then(function(){ return readText(resolve(f)).then(function(t){ t.split('\n').forEach(function(x, i){ if(re.test(x)) o.push((fl.length > 1 ? f + ':' : '') + (p.f.n ? (i+1) + ':' : '') + x); }); }); }); }, Promise.resolve()).then(function(){ return o; });
  };
  C.find = function(args){
    var path = '.', name = null;
    for(var i=0;i<args.length;i++){ if(args[i] === '-name' || args[i] === '-iname'){ name = args[++i]; } else path = args[i]; }
    var a = resolve(path); if(!stat(a)) return err('find: ' + path + ': No existe');
    var re = name ? globRe(name) : null, o = name ? [] : [path];
    walk(a, function(ch){ var nm = ch[ch.length-1]; if(!re || re.test(nm)) o.push(path.replace(/\/$/,'') + '/' + ch.slice(a.length).join('/')); });
    return o;
  };
  C.tree = function(args){
    var a = resolve(args[0] || ''), s = stat(a); if(!s || s.type !== 'dir') return err('tree: ' + (args[0]||'.') + ': No es un directorio');
    var o = [args[0] || '.'], nd = 0, nf = 0;
    (function rec(p, pre, depth){
      if(depth > 10) return;
      var items = list(p);
      items.forEach(function(n, i){
        var last = i === items.length - 1, d = /\/$/.test(n), nm = d ? n.slice(0,-1) : n;
        o.push(pre + (last ? '└── ' : '├── ') + nm); if(d){ nd++; rec(p.concat([nm]), pre + (last ? '    ' : '│   '), depth+1); } else nf++;
      });
    })(a, '', 0);
    o.push(''); o.push(nd + ' directorios, ' + nf + ' archivos'); return o;
  };
  C.whoami = function(){ return [uname()]; };
  C.hostname = function(){ return ['snake-os']; };
  C.date = function(){ return [new Date().toLocaleString('es-ES', { weekday:'long', year:'numeric', month:'long', day:'numeric', hour:'2-digit', minute:'2-digit', second:'2-digit', timeZoneName:'short' })]; };
  C.uname = function(args){ var p = flags(args); if(p.f.a) return ['Snake OS snake-os ' + KERNEL + ' v' + VERSION + ' ' + (navigator.platform || 'web') + ' Snake OS']; if(p.f.r) return [KERNEL]; return ['Snake OS']; };
  C.uptime = function(){ return [uptimeStr()]; };
  C.ps = function(){
    var O = B().openApps(), A = apps(), o = ['  PID  APP                ESTADO      NOMBRE'], i = 100;
    Object.keys(O).forEach(function(id){ var r = O[id] || {}, t = (A[id] && A[id].title) || (r.title) || id; o.push(String(i++).padStart(5) + '  ' + id.padEnd(18) + ' ' + (r.minimized ? 'minimizada' : 'abierta   ') + '  ' + t); });
    return o;
  };
  C.kill = function(args){
    if(!args.length) return err('kill: falta la app (usa ps)');
    var O = B().openApps(), ids = Object.keys(O), o = [];
    args.forEach(function(x){
      var id = null;
      if(/^\d+$/.test(x)) id = ids[parseInt(x,10) - 100];
      if(!id && O[x]) id = x;
      if(!id){ var m = appMatch(x); if(m && O[m]) id = m; }
      if(!id){ o.push('kill: ' + x + ': no hay ninguna app abierta con ese nombre'); return; }
      B().closeApp(id); o.push('Cerrada: ' + id);
    });
    return o;
  };
  C.open = function(args){
    if(!args.length) return err('open: falta la app o el archivo. Apps: ls /apps');
    var a = resolve(args[0]), s = stat(a);
    if(s && s.kind === 'app'){ B().openApp(a[1]); return ['Abriendo ' + a[1] + '…']; }
    if(s && s.kind === 'home'){ B().openFile(s.entry); return ['Abriendo ' + args[0] + '…']; }
    if(s && s.kind === 'note' || (s && s.kind === 'notesdir')){ B().openApp('notes'); return ['Abriendo Notas…']; }
    if(s && s.type === 'dir' && inHome(a)){ B().openApp('explorer'); return ['Abriendo Explorador…']; }
    var id = appMatch(args.join(' '));
    if(!id) return err('open: ' + args.join(' ') + ': no existe esa app ni ese archivo');
    B().openApp(id); return ['Abriendo ' + ((apps()[id] || {}).title || id) + '…'];
  };
  C.neofetch = function(){
    var n = Object.keys(apps()).length, w = (screen && screen.width) ? screen.width + 'x' + screen.height : '?';
    var logo = ['    ____  ', '   / __ \\ ', '  | (__) |', '   \\__  / ', '   ___) | ', '  |____/  ', '          '];
    var info = [uname() + '@snake-os', '-----------------', 'SO: Snake OS ' + VERSION, 'Kernel: ' + KERNEL, 'Tiempo: ' + uptimeStr().replace(/^.*activo /,'').replace(/, 1 usuario$/,''), 'Apps: ' + n + ' (' + Object.keys(B().openApps()).length + ' abiertas)', 'Shell: snake-sh', 'Resolución: ' + w, 'Archivos: ' + files().filter(function(f){ return !isKeep(f.name); }).length + ' · Notas: ' + notes().length];
    var o = []; for(var i=0;i<Math.max(logo.length, info.length);i++) o.push((logo[i] || '          ') + '  ' + (info[i] || '')); return o;
  };
  C.history = function(args, stdin, ctx){ return (ctx.history || []).map(function(h, i){ return String(i+1).padStart(4) + '  ' + h; }); };
  C.clear = function(args, stdin, ctx){ ctx.out.innerHTML = ''; return []; };
  C.cls = C.clear;
  C.exit = function(){ setTimeout(function(){ B().closeApp('terminal'); }, 50); return ['Cerrando Terminal…']; };
  C.nano = function(args, stdin, ctx){
    if(!args[0]) return err('nano: falta el archivo');
    var a = resolve(args[0]), s = stat(a);
    if(s && s.type === 'dir') return err('nano: ' + args[0] + ': Es un directorio');
    return (s ? readText(a) : Promise.resolve('')).then(function(t){ openEditor(ctx, a, t, !!(s && s.ro)); return []; });
  };
  C.edit = C.nano;
  function openEditor(ctx, a, text, ro){
    var wrap = ctx.container.querySelector('.term-wrap') || ctx.container;
    var ed = document.createElement('div');
    ed.className = 'snake-nano';
    ed.style.cssText = 'position:absolute;inset:0;z-index:5;display:flex;flex-direction:column;background:inherit;background-color:#050a08;color:inherit;font:inherit;';
    ed.innerHTML = '<div style="padding:6px 10px;background:rgba(127,255,170,.15);display:flex;justify-content:space-between;gap:8px"><span>nano · ' + fmtPath(a).replace(/[<>&]/g,'') + (ro ? ' (solo lectura)' : '') + '</span><span style="opacity:.7">Ctrl+S guardar · Esc salir</span></div>' +
      '<textarea spellcheck="false" style="flex:1;border:0;outline:none;resize:none;background:transparent;color:inherit;font:inherit;padding:10px;"></textarea>' +
      '<div style="padding:6px 10px;display:flex;gap:8px;align-items:center"><button type="button" data-a="save">Guardar</button><button type="button" data-a="quit">Salir</button><span data-a="msg" style="opacity:.75"></span></div>';
    if(getComputedStyle(wrap).position === 'static') wrap.style.position = 'relative';
    wrap.appendChild(ed);
    var ta = ed.querySelector('textarea'), msg = ed.querySelector('[data-a="msg"]'), dirty = false;
    ta.value = text; ta.readOnly = ro; ta.focus();
    ta.addEventListener('input', function(){ dirty = true; msg.textContent = 'modificado'; });
    function save(){ if(ro){ msg.textContent = 'Archivo de solo lectura'; return; } msg.textContent = 'Guardando…'; writeText(a, ta.value).then(function(){ dirty = false; msg.textContent = 'Guardado ✔'; }).catch(function(e){ msg.textContent = 'Error: ' + e.message; }); }
    function quit(){ if(dirty && !confirm('Hay cambios sin guardar. ¿Salir igualmente?')) return; ed.remove(); try{ ctx.input.focus(); }catch(e){} }
    ed.querySelector('[data-a="save"]').onclick = save;
    ed.querySelector('[data-a="quit"]').onclick = quit;
    ed.addEventListener('keydown', function(e){
      if((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')){ e.preventDefault(); save(); }
      else if(e.key === 'Escape' || (e.ctrlKey && (e.key === 'x' || e.key === 'X'))){ e.preventDefault(); quit(); }
      e.stopPropagation();
    });
  }
  /* ---- Ejecución ---- */
  var PASS = { ssh:1, connect:1, hosts:1, snake:1, look:1, apagar:1, snakeoff:1, lookserver:1 };
  var queue = Promise.resolve();
  function handle(raw, ctx){
    var line = String(raw || '').trim(); if(!line) return true;
    var first = line.split(/\s+/)[0].toLowerCase();
    if(PASS[first]) { ctx.println(prompt() + ' ' + line, 'term-cmd'); return 'NOECHO:' + line; }
    if(first === 'placa'){ ctx.println(prompt() + ' ' + line, 'term-cmd'); return 'NOECHO:' + line.replace(/^\S+\s*/, ''); }
    var plain = line; try{ plain = line.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }catch(e){}
    if(/^(?:llama|llamar|llamale|llamad|call)\b\s+(?:a|con|to)\s+\S/i.test(plain)){ ctx.println(prompt() + ' ' + line, 'term-cmd'); return 'NOECHO:' + line; }
    ctx.println(prompt() + ' ' + line, 'term-cmd');
    queue = queue.then(function(){ return exec(line, ctx); }).catch(function(e){ ctx.println(String(e && e.message || e), 'term-err'); }).then(function(){ setPrompt(ctx); });
    return true;
  }
  function exec(line, ctx){
    var toks = tokenize(line), stages = [[]], redir = null, rtarget = null;
    for(var i=0;i<toks.length;i++){
      var t = toks[i];
      if(typeof t === 'object'){
        if(t.op === '|'){ stages.push([]); continue; }
        redir = t.op; rtarget = toks[++i]; if(typeof rtarget !== 'string') return err('Falta el archivo después de ' + t.op); continue;
      }
      stages[stages.length-1].push(t);
    }
    var stdin = null;
    return stages.reduce(function(pr, st){
      return pr.then(function(prev){
        if(!st.length) throw new Error('Error de sintaxis cerca de |');
        var name = st[0], fn = C[name] || C[name.toLowerCase()];
        if(!fn) throw new Error(name + ': orden no encontrada. Escribe help para ver los comandos.');
        return Promise.resolve(fn(st.slice(1), prev, ctx)).then(function(r){ return (r || []).join('\n'); });
      });
    }, Promise.resolve(stdin)).then(function(outText){
      if(redir){
        var a = resolve(rtarget);
        if(redir === '>>'){
          var s = stat(a);
          return (s ? readText(a) : Promise.resolve('')).then(function(old){ return writeText(a, (old ? old.replace(/\n?$/, '\n') : '') + outText); });
        }
        return writeText(a, outText);
      }
      if(outText !== '') outText.split('\n').forEach(function(l){ ctx.println(l); });
    });
  }
  function setPrompt(ctx){ try{ if(ctx.promptEl) ctx.promptEl.textContent = prompt(); }catch(e){} }
  function complete(ctx){
    var v = ctx.input.value, pos = ctx.input.selectionStart == null ? v.length : ctx.input.selectionStart;
    var before = v.slice(0, pos), m = /(\S*)$/.exec(before), word = m[1];
    var isCmd = before.slice(0, before.length - word.length).trim() === '';
    var cands = [];
    if(isCmd) cands = CMDS.concat(Object.keys(C)).filter(function(c, i, arr){ return arr.indexOf(c) === i && c.indexOf(word) === 0; });
    else {
      var sl = word.lastIndexOf('/'), dirPart = sl >= 0 ? word.slice(0, sl + 1) : '', base = sl >= 0 ? word.slice(sl + 1) : word;
      var a = resolve(dirPart || ''), s = stat(a);
      if(s && s.type === 'dir') cands = list(a).filter(function(n){ return n.indexOf(base) === 0; }).map(function(n){ return dirPart + n; });
      var first = before.trim().split(/\s+/)[0];
      if((first === 'open' || first === 'kill') && !dirPart){ Object.keys(apps()).forEach(function(k){ if(k.indexOf(base) === 0 && cands.indexOf(k) < 0) cands.push(k); }); }
    }
    if(!cands.length) return;
    var common = cands.reduce(function(p, c){ var i = 0; while(i < p.length && p[i] === c[i]) i++; return p.slice(0, i); });
    if(cands.length === 1 && !/\/$/.test(common)) common += ' ';
    if(common.length > word.length){
      var nv = before.slice(0, before.length - word.length) + common;
      ctx.input.value = nv + v.slice(pos);
      try{ ctx.input.setSelectionRange(nv.length, nv.length); }catch(e){}
    } else if(cands.length > 1){ ctx.println(cands.join('  '), 'term-muted'); }
  }
  function mount(ctx){
    cwd = homeArr();
    setPrompt(ctx);
    ctx.input.addEventListener('keydown', function(e){
      if(e.key === 'Tab'){ e.preventDefault(); try{ complete(ctx); }catch(x){} }
      else if(e.key === 'l' && e.ctrlKey){ e.preventDefault(); ctx.out.innerHTML = ''; }
    });
  }
  function banner(ctx){
    ctx.println('Snake OS ' + VERSION + ' · kernel ' + KERNEL, 'term-ok');
    ctx.println('Escribe help para ver los comandos. Tab autocompleta, ↑ ↓ para el historial.', 'term-muted');
  }
  window.SnakeTerminal = { handle: handle, mount: mount, banner: banner, prompt: prompt, setPrompt: setPrompt };
})();
