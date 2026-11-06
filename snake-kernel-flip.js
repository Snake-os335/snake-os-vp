(function () {
  function madridKey(d) {
    var parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    }).formatToParts(d);
    var g = {};
    for (var i = 0; i < parts.length; i++) g[parts[i].type] = parts[i].value;
    return g.year + g.month + g.day + g.hour + g.minute;
  }
  function live() { return madridKey(new Date()) >= '202610302030'; }
  var watching = false;
  function walk(n) {
    if (!n) return;
    if (n.nodeType === 3) {
      if (n.nodeValue && n.nodeValue.indexOf('Doganiero OS! 3') !== -1)
        n.nodeValue = n.nodeValue.split('Doganiero OS! 3').join('Doganiero OS! 4');
      return;
    }
    var c = n.childNodes;
    for (var i = 0; i < c.length; i++) walk(c[i]);
  }
  function arm() {
    if (!live() || !document.body) return;
    walk(document.body);
    if (window.DTV) window.DTV.KERNEL = 'Doganiero OS! 4';
    if (watching) return;
    watching = true;
    new MutationObserver(function (ms) {
      for (var i = 0; i < ms.length; i++) walk(ms[i].target);
    }).observe(document.body, { subtree: true, childList: true, characterData: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', arm);
  else arm();
  setInterval(arm, 15000);
})();
