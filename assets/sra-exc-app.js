
(function(){
  var h = React.createElement, X = ExcalidrawLib, root = document.getElementById('app');
  var KEEP = ['viewBackgroundColor','currentItemStrokeColor','currentItemBackgroundColor','currentItemFillStyle','currentItemStrokeWidth','currentItemRoughness','currentItemOpacity','currentItemFontFamily','currentItemFontSize','currentItemTextAlign','currentItemStrokeStyle','currentItemRoundness','gridSize','zenModeEnabled','scrollX','scrollY','zoom','name','theme'];
  var last = null, timer = null, api = null;
  function pick(st){ var o = {}; KEEP.forEach(function(k){ if (st[k] !== undefined) o[k] = st[k]; }); return o; }
  function flush(){ if (!last) return; var d = last; last = null; clearTimeout(timer); try { SRA.save('scene', d); } catch(e){} }
  SRA.onClose(flush);
  window.addEventListener('pagehide', flush);
  function onChange(els, st, files){
    var used = {}; els.forEach(function(e){ if (e.fileId && !e.isDeleted) used[e.fileId] = 1; });
    var fl = {}; Object.keys(files || {}).forEach(function(k){ if (used[k]) fl[k] = files[k]; });
    last = { elements: X.getNonDeletedElements ? X.getNonDeletedElements(els) : els, appState: pick(st), files: fl, at: Date.now() };
    clearTimeout(timer); timer = setTimeout(flush, 600);
  }
  SRA.load('scene').then(null, function(){ return null; }).then(function(saved){
    var init = saved ? { elements: saved.elements || [], appState: Object.assign({}, saved.appState || {}, { collaborators: new Map() }), files: saved.files || {}, scrollToContent: false } : null;
    var themeSet = saved && saved.appState && saved.appState.theme ? saved.appState.theme : (SRA.theme === 'light' ? 'light' : 'dark');
    if (init) init.appState.theme = themeSet;
    ReactDOM.createRoot(root).render(h(X.Excalidraw, {
      initialData: init || { appState: { theme: themeSet } },
      langCode: SRA.en ? 'en' : 'es-ES',
      onChange: onChange,
      excalidrawAPI: function(a){ api = a; },
      validateEmbeddable: false,
      UIOptions: { canvasActions: { loadScene: true, saveToActiveFile: true, export: { saveFileToDisk: true }, saveAsImage: true, toggleTheme: true, clearCanvas: true, changeViewBackgroundColor: true } }
    }, h(X.MainMenu, null,
        h(X.MainMenu.DefaultItems.LoadScene), h(X.MainMenu.DefaultItems.SaveToActiveFile), h(X.MainMenu.DefaultItems.Export), h(X.MainMenu.DefaultItems.SaveAsImage),
        h(X.MainMenu.DefaultItems.ClearCanvas), h(X.MainMenu.Separator), h(X.MainMenu.DefaultItems.ToggleTheme), h(X.MainMenu.DefaultItems.ChangeCanvasBackground), h(X.MainMenu.Separator), h(X.MainMenu.DefaultItems.Help)),
      h(X.WelcomeScreen, null, h(X.WelcomeScreen.Center, null, h(X.WelcomeScreen.Center.Logo), h(X.WelcomeScreen.Center.Heading, null, SRA.T('Dibuja lo que quieras. Todo se guarda solo en este perfil.', 'Draw anything. Everything is saved automatically on this profile.')), h(X.WelcomeScreen.Center.Menu, null, h(X.WelcomeScreen.Center.MenuItemLoadScene), h(X.WelcomeScreen.Center.MenuItemHelp))), h(X.WelcomeScreen.Hints.MenuHint), h(X.WelcomeScreen.Hints.ToolbarHint), h(X.WelcomeScreen.Hints.HelpHint))
    ));
  });
})();
