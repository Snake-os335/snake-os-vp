
(function(){
  var T = SRA.T, ES = {"toolbar": {"undo": "Deshacer", "redo": "Rehacer", "print": "Imprimir", "paintformat": "Copiar formato", "clearformat": "Borrar formato", "format": "Formato", "fontName": "Fuente", "fontSize": "Tamaño de fuente", "fontBold": "Negrita", "fontItalic": "Cursiva", "underline": "Subrayado", "strike": "Tachado", "color": "Color del texto", "bgcolor": "Color de relleno", "border": "Bordes", "merge": "Combinar celdas", "align": "Alineación horizontal", "valign": "Alineación vertical", "textwrap": "Ajustar texto", "freeze": "Inmovilizar celda", "autofilter": "Filtro", "formula": "Funciones", "more": "Más"}, "contextmenu": {"copy": "Copiar", "cut": "Cortar", "paste": "Pegar", "pasteValue": "Pegar solo valores", "pasteFormat": "Pegar solo formato", "hide": "Ocultar", "insertRow": "Insertar fila", "insertColumn": "Insertar columna", "deleteSheet": "Eliminar", "deleteRow": "Eliminar fila", "deleteColumn": "Eliminar columna", "deleteCell": "Eliminar celda", "deleteCellText": "Borrar texto de la celda", "validation": "Validación de datos", "cellprintable": "Permitir exportar", "cellnonprintable": "No exportar", "celleditable": "Permitir editar", "cellnoneditable": "No permitir editar"}, "print": {"size": "Tamaño del papel", "orientation": "Orientación", "orientations": ["Horizontal", "Vertical"]}, "format": {"normal": "Normal", "text": "Texto", "number": "Número", "percent": "Porcentaje", "rmb": "RMB", "usd": "USD", "eur": "EUR", "date": "Fecha", "time": "Hora", "datetime": "Fecha y hora", "duration": "Duración"}, "formula": {"sum": "Suma (SUM)", "average": "Media (AVERAGE)", "max": "Máximo (MAX)", "min": "Mínimo (MIN)", "_if": "SI (IF)", "and": "Y (AND)", "or": "O (OR)", "concat": "Unir (CONCAT)"}, "validation": {"required": "es obligatorio", "notMatch": "no cumple la regla de validación", "between": "está entre {} y {}", "notBetween": "no está entre {} y {}", "notIn": "no está en la lista", "equal": "es igual a {}", "notEqual": "no es igual a {}", "lessThan": "es menor que {}", "lessThanEqual": "es menor o igual que {}", "greaterThan": "es mayor que {}", "greaterThanEqual": "es mayor o igual que {}"}, "error": {"pasteForMergedCell": "No se puede hacer en celdas combinadas"}, "calendar": {"weeks": ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"], "months": ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"]}, "button": {"next": "Siguiente", "cancel": "Cancelar", "remove": "Quitar", "save": "Guardar", "ok": "Aceptar"}, "sort": {"desc": "Ordenar Z → A", "asc": "Ordenar A → Z"}, "filter": {"empty": "vacío"}, "dataValidation": {"mode": "Modo", "range": "Rango de celdas", "criteria": "Criterio", "modeType": {"cell": "Celda", "column": "Columna", "row": "Fila"}, "type": {"list": "Lista", "number": "Número", "date": "Fecha", "phone": "Teléfono", "email": "Correo"}, "operator": {"be": "entre", "nbe": "no entre", "lt": "menor que", "lte": "menor o igual que", "gt": "mayor que", "gte": "mayor o igual que", "eq": "igual a", "neq": "distinto de"}}};
  if (!SRA.en) x_spreadsheet.locale('es', ES);
  var bar = document.getElementById('bar'), st = document.getElementById('st'), timer = null, sp = null;
  function save(){ clearTimeout(timer); if (!sp) return; try { SRA.save('book', { data: sp.getData(), at: Date.now() }); st.textContent = T('Guardado', 'Saved'); } catch (e) {} }
  SRA.onClose(save); window.addEventListener('pagehide', save);
  function size(){ var b = document.getElementById('sheet'); return { width: function(){ return b.clientWidth; }, height: function(){ return b.clientHeight; } }; }
  function csvParse(t){ var rows = [], row = [], f = '', q = false, sep = (t.split('\n')[0].split(';').length > t.split('\n')[0].split(',').length) ? ';' : ',';
    for (var i = 0; i < t.length; i++) { var c = t[i];
      if (q) { if (c === '"') { if (t[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
      else if (c === '"') q = true; else if (c === sep) { row.push(f); f = ''; } else if (c === '\n') { row.push(f.replace(/\r$/, '')); rows.push(row); row = []; f = ''; } else f += c; }
    if (f || row.length) { row.push(f); rows.push(row); } return rows; }
  function toCsv(d){ var rows = (d && d.rows) || {}, max = -1, out = [];
    Object.keys(rows).forEach(function(k){ if (/^\d+$/.test(k)) max = Math.max(max, +k); });
    for (var r = 0; r <= max; r++) { var cells = (rows[r] && rows[r].cells) || {}, mc = -1, line = [];
      Object.keys(cells).forEach(function(k){ if (/^\d+$/.test(k)) mc = Math.max(mc, +k); });
      for (var c = 0; c <= mc; c++) { var v = cells[c] && cells[c].text != null ? String(cells[c].text) : ''; line.push(/[",;\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v); }
      out.push(line.join(',')); }
    return out.join('\n'); }
  function btn(label, title, fn){ var b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.title = title; b.addEventListener('click', fn); bar.insertBefore(b, st); }
  SRA.load('book').then(null, function(){ return null; }).then(function(saved){
    sp = x_spreadsheet('#sheet', { showToolbar: true, showGrid: true, showContextmenu: true, showBottomBar: true, view: { height: function(){ return document.getElementById('sheet').clientHeight; }, width: function(){ return document.getElementById('sheet').clientWidth; } }, row: { len: 200, height: 25 }, col: { len: 52, width: 100, indexWidth: 60, minWidth: 60 } });
    if (saved && saved.data) sp.loadData(saved.data);
    else sp.loadData([{ name: T('Hoja1', 'Sheet1'), rows: { 0: { cells: { 0: { text: T('Producto', 'Item') }, 1: { text: T('Cantidad', 'Qty') }, 2: { text: T('Precio', 'Price') }, 3: { text: 'Total' } } },
      1: { cells: { 0: { text: T('Manzanas', 'Apples') }, 1: { text: '3' }, 2: { text: '0.5' }, 3: { text: '=B2*C2' } } },
      2: { cells: { 0: { text: T('Pan', 'Bread') }, 1: { text: '2' }, 2: { text: '1.2' }, 3: { text: '=B3*C3' } } },
      3: { cells: { 0: { text: 'Total' }, 3: { text: '=SUM(D2:D3)' } } } } }]);
    sp.change(function(){ st.textContent = T('Guardando…', 'Saving…'); clearTimeout(timer); timer = setTimeout(save, 700); });
    var inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.csv,text/csv,text/plain'; inp.hidden = true; document.body.appendChild(inp);
    inp.addEventListener('change', function(){ var f = inp.files && inp.files[0]; if (!f) return; f.text().then(function(t){
      var rows = {}; csvParse(t).forEach(function(r, i){ var cells = {}; r.forEach(function(v, j){ if (v !== '') cells[j] = { text: v }; }); rows[i] = { cells: cells }; });
      rows.len = Math.max(200, Object.keys(rows).length + 20);
      var d = sp.getData(); d.push({ name: f.name.replace(/\.[^.]+$/, '').slice(0, 30), rows: rows }); sp.loadData(d); save(); }); inp.value = ''; });
    btn(T('Importar CSV…', 'Import CSV…'), T('Abre un archivo CSV en una hoja nueva', 'Open a CSV file in a new sheet'), function(){ inp.click(); });
    btn(T('Exportar CSV', 'Export CSV'), T('Descarga la primera hoja como CSV', 'Download the first sheet as CSV'), function(){ var d = sp.getData(); var s0 = d[0] || {}; SRA.download(new Blob(['\ufeff' + toCsv(s0)], { type: 'text/csv' }), (s0.name || 'hoja') + '.csv'); });
    btn(T('Copia de seguridad', 'Backup'), T('Descarga todas las hojas (.json) para abrirlas otra vez aquí', 'Download all sheets (.json) to open them here again'), function(){ SRA.download(new Blob([JSON.stringify(sp.getData())], { type: 'application/json' }), 'hojas.json'); });
    var inj = document.createElement('input'); inj.type = 'file'; inj.accept = '.json,application/json'; inj.hidden = true; document.body.appendChild(inj);
    inj.addEventListener('change', function(){ var f = inj.files && inj.files[0]; if (!f) return; f.text().then(function(t){ try { var d = JSON.parse(t); if (Array.isArray(d)) { sp.loadData(d); save(); } } catch (e) { alert(T('Ese archivo no es una copia de seguridad válida.', 'That file is not a valid backup.')); } }); inj.value = ''; });
    btn(T('Restaurar…', 'Restore…'), T('Abre una copia de seguridad .json', 'Open a .json backup'), function(){ inj.click(); });
    st.textContent = saved ? T('Guardado', 'Saved') : '';
  });
})();
