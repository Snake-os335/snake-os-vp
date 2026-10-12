/* Teclado de membrana: escribe en el campo que tengas abierto en Snake OS. */
(function () {
  var last = 0;
  var primed = false;

  function dispatch(el, key) {
    var init = { key: key, bubbles: true, cancelable: true };
    try { el.dispatchEvent(new KeyboardEvent('keydown', init)); } catch (e) {}
    try { el.dispatchEvent(new KeyboardEvent('keyup', init)); } catch (e2) {}
  }

  function editable(el) {
    if (!el || el.nodeType !== 1) return false;
    if (el.isContentEditable) return true;
    var tag = el.tagName;
    if (tag !== 'INPUT' && tag !== 'TEXTAREA') return false;
    var type = (el.type || 'text').toLowerCase();
    if (type === 'button' || type === 'submit' || type === 'checkbox' || type === 'radio' || type === 'file' || type === 'range' || type === 'color') return false;
    return !el.readOnly && !el.disabled;
  }

  function setRange(el, pos) {
    try {
      el.selectionStart = pos;
      el.selectionEnd = pos;
    } catch (e) {}
  }

  function typeKey(k) {
    var el = document.activeElement;
    if (k === 'enter') {
      if (editable(el)) dispatch(el, 'Enter');
      else dispatch(document.body, 'Enter');
      if (el && el.tagName === 'TEXTAREA') {
        var start = el.selectionStart || 0;
        var end = el.selectionEnd || 0;
        el.value = el.value.slice(0, start) + '\n' + el.value.slice(end);
        setRange(el, start + 1);
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }
      return;
    }
    if (k === 'backspace') {
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') && editable(el)) {
        var a = el.selectionStart || 0;
        var b = el.selectionEnd || 0;
        if (a === b && a > 0) {
          el.value = el.value.slice(0, a - 1) + el.value.slice(b);
          setRange(el, a - 1);
        } else {
          el.value = el.value.slice(0, a) + el.value.slice(b);
          setRange(el, a);
        }
        el.dispatchEvent(new Event('input', { bubbles: true }));
      } else if (el && el.isContentEditable) {
        document.execCommand('delete', false);
      }
      if (editable(el)) dispatch(el, 'Backspace');
      return;
    }
    if (!k || k.length !== 1) return;
    if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') && editable(el)) {
      var s = el.selectionStart || 0;
      var e = el.selectionEnd || 0;
      el.value = el.value.slice(0, s) + k + el.value.slice(e);
      setRange(el, s + 1);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      dispatch(el, k);
      return;
    }
    if (el && el.isContentEditable) {
      document.execCommand('insertText', false, k);
      return;
    }
  }

  async function tick() {
    try {
      var res = await fetch('/api/keypad?after=' + last, { cache: 'no-store' });
      if (!res.ok) return;
      var data = await res.json();
      var keys = data.keys || [];
      for (var i = 0; i < keys.length; i++) {
        var item = keys[i];
        if (item.id > last) last = item.id;
        if (primed && document.hasFocus()) typeKey(item.k);
      }
      primed = true;
    } catch (e) {}
  }

  setInterval(tick, 80);
  tick();
})();
