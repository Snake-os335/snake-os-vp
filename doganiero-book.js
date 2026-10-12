/* DoganieroBook — red social de canales (Dogaemail). Visitas reales + bandeja. */
(function () {
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  // Logo de DoganieroBook (imagen; si falla, el emoji de siempre)
  function bookLogoNode() {
    var d = el('div', 'dbook-logo');
    var im = document.createElement('img');
    im.src = '/static/assets/doganiero-book-icon.png?v=1';
    im.alt = '';
    im.style.cssText = 'width:1.7em;height:1.7em;object-fit:contain;vertical-align:-0.5em;margin-right:6px;';
    im.onerror = function () { try { im.remove(); d.insertBefore(document.createTextNode('📗 '), d.firstChild); } catch (e) {} };
    d.appendChild(im);
    d.appendChild(document.createTextNode('DoganieroBook'));
    return d;
  }
  function fmtViews(n) {
    n = Number(n) || 0;
    if (n >= 1000000) return (n / 1000000).toFixed(1).replace(/\.0$/, '') + ' M';
    if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + ' mil';
    return String(n);
  }

  function fmtDate(ts) {
    try {
      return new Date((Number(ts) || 0) * 1000).toLocaleString('es-ES', {
        day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
      });
    } catch (e) {
      return '';
    }
  }

  // ---- Extras 2026-10-09: tiempos relativos, compartir, Direct™ ----
  function fmtAgo(ts) {
    var t = (Number(ts) || 0) * 1000;
    if (!t) return '';
    var s = Math.round((Date.now() - t) / 1000);
    if (s < 45) return 'hace un momento';
    var m = Math.round(s / 60);
    if (m < 60) return 'hace ' + m + ' min';
    var h = Math.round(m / 60);
    if (h < 24) return 'hace ' + h + ' h';
    var d = Math.round(h / 24);
    if (d <= 1) return 'ayer';
    if (d < 7) return 'hace ' + d + ' días';
    return fmtDate(ts);
  }
  function agoNode(ts, cls) {
    var n = el('span', cls || 'dbook-ago', fmtAgo(ts));
    n.title = fmtDate(ts);
    n.setAttribute('data-ago', String(Number(ts) || 0));
    return n;
  }
  function bookLink(kind, id) {
    return location.origin + '/#book/' + kind + '/' + encodeURIComponent(String(id));
  }
  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
    return new Promise(function (resolve, reject) {
      try {
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0;';
        document.body.appendChild(ta);
        ta.select();
        var ok = document.execCommand('copy');
        ta.remove();
        if (ok) resolve(); else reject(new Error('copy'));
      } catch (e) { reject(e); }
    });
  }
  function isDirectPost(p) { return !!p && p.kind === 'video' && /^Direct™/.test(String(p.title || '')); }
  var CSORT_KEY = 'snakeos_book_csort_v1';
  function getCSort() { try { return localStorage.getItem(CSORT_KEY) === 'new' ? 'new' : 'old'; } catch (e) { return 'old'; } }
  function setCSort(v) { try { localStorage.setItem(CSORT_KEY, v); } catch (e) {} }
  function ensureBookExtraCss() {
    if (document.getElementById('dbook-extra-css-20261009')) return;
    var st = document.createElement('style');
    st.id = 'dbook-extra-css-20261009';
    st.textContent = [
      '.dbook-subtabs{display:flex;gap:6px;flex-wrap:wrap;}',
      '.dbook-subtab{width:auto !important;margin:0 !important;border:1px solid rgba(255,255,255,.16);background:rgba(0,0,0,.25);color:#e8f5ec;border-radius:999px;padding:6px 12px;font-weight:700;font-size:.78rem;cursor:pointer;transition:background .2s,border-color .2s;}',
      '.dbook-subtab.on{background:rgba(52,209,122,.28);border-color:#9dffc2;color:#fff;}',
      '.dbook-ch-hero{position:relative;padding:16px;border-radius:18px;background:linear-gradient(135deg,rgba(31,158,87,.45),rgba(14,60,36,.55) 55%,rgba(0,0,0,.3));border:1px solid rgba(157,255,194,.25);align-items:center;margin-bottom:0;}',
      '.dbook-ch-info{min-width:0;flex:1;}',
      '.dbook-ch-info h2{overflow-wrap:anywhere;}',
      '.dbook-ch-bio{margin:6px 0 0;font-size:.88rem;color:rgba(232,245,236,.9);white-space:pre-wrap;overflow-wrap:anywhere;}',
      '.dbook-ch-stats{display:flex;gap:16px;flex-wrap:wrap;margin-top:10px;}',
      '.dbook-stat{display:flex;flex-direction:column;line-height:1.15;}',
      '.dbook-stat strong{font-size:1rem;color:#fff;}',
      '.dbook-stat span{font-size:.7rem;color:rgba(232,245,236,.72);}',
      '.dbook-ch-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px;}',
      '.dbook-ch-actions .dbook-btn,.dbook-back,.dbook-share,.dbook-empty .dbook-btn,.dbook-gate .dbook-btn{width:auto !important;margin-top:0 !important;}',
      '.dbook-ch-hero .dbook-av.big{width:72px;height:72px;font-size:2rem;border:3px solid rgba(157,255,194,.55);box-shadow:0 6px 18px rgba(0,0,0,.35);}',
      '.dbook-back{font-size:.8rem;align-self:flex-start;}',
      '.dbook-csort{display:flex;gap:6px;align-items:center;}',
      '.dbook-csort-btn{width:auto !important;margin:0 !important;border:1px solid rgba(255,255,255,.14);background:transparent;color:rgba(232,245,236,.75);border-radius:999px;padding:3px 10px;font-size:.72rem;font-weight:700;cursor:pointer;}',
      '.dbook-csort-btn.on{background:rgba(52,209,122,.22);color:#b8ff6a;border-color:rgba(157,255,194,.45);}',
      '.dbook-follow-chip,.dbook-direct-chip{display:inline-block;margin-left:6px;padding:1px 7px;border-radius:999px;font-size:.68rem;font-weight:800;background:rgba(52,209,122,.22);color:#b8ff6a;vertical-align:1px;}',
      '.dbook-direct-chip{background:rgba(255,77,109,.2);color:#ff9db0;}',
      '.dbook-card{transition:box-shadow .3s,border-color .3s;}',
      '.dbook-card.dbook-flash{border-color:#9dffc2;box-shadow:0 0 0 3px rgba(157,255,194,.35);}',
      '.dbook-empty .dbook-btn{margin-top:10px !important;}',
      '.dbook-empty p{margin:0;}',
      '.dbook-meta-row .dbook-link{width:auto !important;margin-top:0 !important;}',
      '.dbook-root .dbook-nav .dbook-tab,.dbook-root .dbook-inbox-btn,.dbook-root .dbook-inbox-actions .dbook-btn,.dbook-root .dbook-need-channel .dbook-btn,.dbook-root .dbook-body > .dbook-btn{width:auto !important;margin-top:0 !important;}',
      '.dbook-root .dbook-form > .dbook-btn{width:100% !important;margin-top:4px !important;}',
      '.dbook-root .dbook-link{width:auto !important;margin-top:0 !important;border:none !important;background:none !important;box-shadow:none !important;padding:2px 0 !important;border-radius:6px;}',
      '.dbook-root .dbook-link:focus-visible{outline:2px solid #9dffc2;outline-offset:2px;}',
      '.dbook-root .dbook-channel-row{margin-top:0 !important;}',
      '.dbook-root .dbook-meta-row{justify-content:flex-start;column-gap:14px;}',
      '.dbook-root .dbook-meta-row .dbook-del{margin-left:auto !important;width:auto !important;}',
      'body.phone-mode .dbook-ch-hero{flex-direction:column;align-items:flex-start;}',
      '@media (max-width:480px){.dbook-ch-hero{flex-direction:column;align-items:flex-start;}}'
    ].join('\n');
    document.head.appendChild(st);
  }

  async function api(path, opts) {
    opts = opts || {};
    var headers = Object.assign({}, opts.headers || {});
    var body = opts.body;
    // No forzar JSON si es FormData (el navegador pone el boundary)
    if (!(body instanceof FormData) && body != null && typeof body === 'object' && !(body instanceof Blob) && !(body instanceof ArrayBuffer)) {
      body = JSON.stringify(body);
    }
    if (!(body instanceof FormData) && !headers['Content-Type'] && !headers['content-type']) {
      headers['Content-Type'] = 'application/json';
    }
    var res = await fetch(path, Object.assign({}, opts, {
      credentials: 'same-origin',
      headers: headers,
      body: body
    }));
    var data = null;
    try { data = await res.json(); } catch (e) { data = null; }
    if (res.status === 401) {
      var err = new Error('login');
      err.code = 401;
      throw err;
    }
    if (!res.ok) {
      var detail = data && (data.detail || data.error);
      if (Array.isArray(detail)) {
        detail = detail.map(function (d) { return (d && d.msg) ? d.msg : String(d); }).join('; ');
      }
      var msg = detail ? String(detail) : ('Error ' + res.status);
      var e2 = new Error(msg);
      e2.code = res.status;
      throw e2;
    }
    return data;
  }

  function fileToDataUrl(file) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { resolve(String(r.result || '')); };
      r.onerror = function () { reject(new Error('No se pudo leer el archivo')); };
      r.readAsDataURL(file);
    });
  }

  function getVideoDurationSec(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var v = document.createElement('video');
      v.preload = 'metadata';
      v.onloadedmetadata = function () {
        var d = Number(v.duration);
        URL.revokeObjectURL(url);
        if (!isFinite(d) || d <= 0) reject(new Error('No se pudo leer la duración del vídeo'));
        else resolve(d);
      };
      v.onerror = function () {
        URL.revokeObjectURL(url);
        reject(new Error('No se pudo leer el vídeo'));
      };
      v.src = url;
    });
  }

  var BOOK_VIDEO_MAX_SEC = 30 * 60;
  var BOOK_VIDEO_MAX_BYTES = 100 * 1024 * 1024;
  var BOOK_IMAGE_MAX_BYTES = 40 * 1024 * 1024;

  function channelAvatarNode(ch, big) {
    var wrap = el('span', 'dbook-av' + (big ? ' big' : ''));
    var url = ch && ch.photoUrl;
    if (url) {
      var img = document.createElement('img');
      img.src = url + (url.indexOf('?') >= 0 ? '&' : '?') + 'cb=' + Date.now();
      img.alt = '';
      img.className = 'dbook-av-img';
      wrap.appendChild(img);
    } else {
      wrap.textContent = (ch && ch.owner && ch.owner.avatar) || '👤';
    }
    return wrap;
  }

  function renderDoganieroBookApp(container) {
    ensureBookExtraCss();
    container.innerHTML = '';
    var root = el('div', 'dbook-root');
    container.appendChild(root);

    var state = {
      tab: 'feed',
      me: null,
      channel: null,
      feed: [],
      channels: [],
      viewing: null,
      inbox: [],
      inboxUnread: 0,
      showInbox: true, // se abre siempre al entrar
      busy: false,
      msg: '',
      pendingPhotoDataUrl: null,
      pendingPhotoPreview: null,
      feedMode: 'all',
      follows: [],
      chTab: 'posts',
      chInfo: null
    };

    function setMsg(t, isErr) {
      state.msg = t || '';
      var m = root.querySelector('[data-db="msg"]');
      if (!m) return;
      m.textContent = state.msg;
      m.className = 'dbook-msg' + (isErr ? ' err' : '');
    }

    async function refreshMe() {
      var data = await api('/api/book/me');
      state.me = data.user || null;
      state.channel = data.channel || null;
      state.inbox = data.inbox || [];
      state.inboxUnread = data.inboxUnread || 0;
    }

    async function loadFeed() {
      var data = await api('/api/book/feed');
      state.feed = data.posts || [];
    }

    async function loadChannels() {
      var data = await api('/api/book/channels');
      state.channels = data.channels || [];
    }

    async function loadFollows() {
      try {
        var d = await api('/api/book/follows');
        state.follows = ((d && d.handles) || []).map(function (h) { return String(h).toLowerCase(); });
      } catch (e) {
        if (e && e.code === 401) throw e;
      }
    }
    // «Siguiendo»: junta las publicaciones de cada canal seguido (no solo las 50 últimas del feed)
    var followFeedBusy = null;
    function loadFollowFeed() {
      var hs = state.follows.slice(0, 20);
      var key = hs.join(',');
      if (!hs.length || followFeedBusy === key) return;
      followFeedBusy = key;
      Promise.all(hs.map(function (h) {
        return api('/api/book/channel/' + encodeURIComponent(h))
          .then(function (d) { return (d && d.posts) || []; })
          .catch(function () { return null; });
      })).then(function (lists) {
        followFeedBusy = null;
        if (lists.every(function (l) { return l === null; })) return;
        var seen = {}, all = [];
        lists.forEach(function (l) {
          (l || []).forEach(function (p) {
            if (!p || seen[p.id]) return;
            seen[p.id] = true; all.push(p);
          });
        });
        all.sort(function (a, b) { return (Number(b.createdAt) || 0) - (Number(a.createdAt) || 0); });
        state.followFeed = all.slice(0, 80);
        state.followFeedKey = key;
        if (state.tab === 'feed' && state.feedMode === 'following') paint();
      });
    }
    function isFollowing(handle) { return state.follows.indexOf(String(handle || '').toLowerCase()) >= 0; }

    async function openChannel(handle, opts) {
      var data = await api('/api/book/channel/' + encodeURIComponent(handle));
      state.viewing = { channel: data.channel, posts: data.posts || [] };
      state.tab = 'channel';
      state.chTab = (opts && opts.chTab) || 'posts';
      state.chInfo = null;
      paint();
      try { var b0 = root.querySelector('.dbook-body'); if (b0) b0.scrollTop = 0; } catch (eS) {}
      var h0 = data.channel && data.channel.handle;
      if (h0) {
        api('/api/book/follow/' + encodeURIComponent(h0)).then(function (info) {
          if (!state.viewing || !state.viewing.channel || state.viewing.channel.handle !== h0) return;
          state.chInfo = info;
          paintChannelStats();
        }).catch(function () {});
      }
    }

    function paintChannelStats() {
      var st = root.querySelector('[data-db="ch-stats"]');
      var ch = state.viewing && state.viewing.channel;
      if (!st || !ch) return;
      var info = state.chInfo || {};
      var posts = state.viewing.posts || [];
      var n = posts.length;
      var views = info.totalViews != null ? info.totalViews : posts.reduce(function (a, p) { return a + (Number(p.views) || 0); }, 0);
      var likes = info.totalLikes != null ? info.totalLikes : posts.reduce(function (a, p) { return a + (Number(p.likeCount) || 0); }, 0);
      st.innerHTML = '';
      [
        [fmtViews(n), n === 1 ? 'publicación' : 'publicaciones'],
        [info.followers != null ? fmtViews(info.followers) : '…', info.followers === 1 ? 'seguidor' : 'seguidores'],
        [fmtViews(views), 'visitas'],
        [fmtViews(likes), 'me gusta']
      ].forEach(function (s) {
        var b = el('div', 'dbook-stat');
        b.appendChild(el('strong', null, s[0]));
        b.appendChild(el('span', null, s[1]));
        st.appendChild(b);
      });
      var fb = root.querySelector('[data-db="follow"]');
      if (fb) {
        var on = info.following != null ? !!info.following : isFollowing(ch.handle);
        fb.textContent = on ? '✔ Siguiendo' : '➕ Seguir';
        fb.classList.toggle('ghost', on);
        fb.setAttribute('aria-pressed', on ? 'true' : 'false');
        fb.title = on ? 'Dejar de seguir este canal' : 'Seguir este canal';
      }
    }

    async function toggleFollow(ch, fb) {
      if (fb.disabled) return;
      var cur = (state.chInfo && state.chInfo.following != null) ? !!state.chInfo.following : isFollowing(ch.handle);
      var on = !cur;
      fb.disabled = true;
      try {
        var info = await api('/api/book/follow/' + encodeURIComponent(ch.handle), { method: 'POST', body: { follow: on } });
        state.chInfo = info;
        var h = String(ch.handle).toLowerCase();
        state.follows = state.follows.filter(function (x) { return x !== h; });
        if (info && info.following) state.follows.unshift(h);
        setMsg(info && info.following ? ('Ahora sigues a @' + ch.handle + ': verás sus publicaciones en «Siguiendo»') : ('Has dejado de seguir a @' + ch.handle));
      } catch (e) {
        if (e && e.code === 401) { onErr(e); return; }
        setMsg((e && e.message) || 'No se pudo actualizar', true);
      } finally {
        fb.disabled = false;
        paintChannelStats();
      }
    }

    function flashPost(id) {
      var c = root.querySelector('.dbook-card[data-post-id="' + Number(id) + '"]');
      if (!c) return false;
      try { c.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (e) { try { c.scrollIntoView(); } catch (e2) {} }
      c.classList.add('dbook-flash');
      setTimeout(function () { c.classList.remove('dbook-flash'); }, 2400);
      return true;
    }

    // Enlaces compartidos: #book/post/<id> o #book/canal/<handle>
    function handleDeepLink() {
      var m = /^#book\/(post|canal)\/(.+)$/.exec(location.hash || '');
      if (!m) return false;
      try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {}
      var val = '';
      try { val = decodeURIComponent(m[2]); } catch (e) { val = m[2]; }
      state.showInbox = false;
      if (m[1] === 'canal') {
        openChannel(val).catch(function (e) {
          if (e && e.code === 401) { onErr(e); return; }
          setMsg('Ese canal ya no existe', true);
        });
      } else {
        var pid = parseInt(val, 10);
        if (!pid) return false;
        api('/api/book/posts/' + pid).then(function (p) {
          return openChannel(p.handle).then(function () { setTimeout(function () { flashPost(pid); }, 120); });
        }).catch(function (e) {
          if (e && e.code === 401) { onErr(e); return; }
          setMsg('Esa publicación ya no existe', true);
        });
      }
      return true;
    }

    async function recordView(post, viewEl) {
      if (!post || !post.id) return;
      try {
        var res = await api('/api/book/posts/' + post.id + '/view', { method: 'POST', body: '{}' });
        post.views = res.views;
        if (viewEl) viewEl.textContent = '👁 ' + fmtViews(post.views) + ' visitas';
        [state.feed].concat(state.viewing ? [state.viewing.posts] : []).forEach(function (list) {
          if (!list) return;
          list.forEach(function (p) { if (p.id === post.id) p.views = res.views; });
        });
      } catch (e) { /* ignore */ }
    }

    async function closeInbox(markRead) {
      state.showInbox = false;
      if (markRead) {
        try {
          var res = await api('/api/book/inbox/read', { method: 'POST', body: '{}' });
          state.inboxUnread = res.unread || 0;
          state.inbox.forEach(function (m) { m.read = true; });
        } catch (e) {}
      }
      paint();
    }

    function paintInboxOverlay() {
      var ov = el('div', 'dbook-inbox-overlay');
      var panel = el('div', 'dbook-inbox-panel');
      var head = el('div', 'dbook-inbox-head');
      head.appendChild(el('div', 'dbook-logo', '📬 Bandeja de entrada'));
      var unread = el('span', 'dbook-inbox-badge', state.inboxUnread ? (state.inboxUnread + ' sin leer') : 'Al día');
      head.appendChild(unread);
      panel.appendChild(head);
      panel.appendChild(el('p', 'dbook-muted', 'Se abre cada vez que entras a DoganieroBook.'));

      var list = el('div', 'dbook-inbox-list');
      if (!state.inbox.length) {
        list.appendChild(el('p', 'dbook-empty', 'No hay mensajes.'));
      } else {
        state.inbox.forEach(function (m) {
          var card = el('article', 'dbook-inbox-item' + (m.read ? '' : ' unread'));
          card.appendChild(el('strong', null, m.title || 'Aviso'));
          card.appendChild(el('p', null, m.body || ''));
          card.appendChild(el('div', 'dbook-muted', fmtDate(m.createdAt)));
          list.appendChild(card);
        });
      }
      panel.appendChild(list);

      var actions = el('div', 'dbook-inbox-actions');
      var goChannel = el('button', 'dbook-btn ghost', state.channel ? 'Ir a mi canal' : 'Crear mi canal');
      goChannel.type = 'button';
      goChannel.addEventListener('click', function () {
        state.tab = 'mine';
        closeInbox(true);
      });
      var closeBtn = el('button', 'dbook-btn', 'Continuar');
      closeBtn.type = 'button';
      closeBtn.addEventListener('click', function () { closeInbox(true); });
      actions.appendChild(goChannel);
      actions.appendChild(closeBtn);
      panel.appendChild(actions);
      ov.appendChild(panel);
      root.appendChild(ov);
    }

    function paintLoginGate() {
      root.innerHTML = '';
      var card = el('div', 'dbook-gate');
      card.appendChild(bookLogoNode());
      card.appendChild(el('p', null, 'Red social de canales Doganiero. Entra con tu cuenta para ver y publicar.'));
      var btn = el('button', 'dbook-btn', 'Ir a iniciar sesión');
      btn.type = 'button';
      btn.addEventListener('click', function () {
        try {
          if (typeof showLogin === 'function') showLogin();
          else if (document.getElementById('loginView')) {
            document.getElementById('loginView').classList.remove('hidden');
          }
        } catch (e) {}
      });
      card.appendChild(btn);
      root.appendChild(card);
    }

    // Quita una publicación del estado y de la pantalla (borrada por mí o por su dueño)
    function dropPost(id) {
      id = Number(id);
      state.feed = (state.feed || []).filter(function (p) { return Number(p.id) !== id; });
      if (state.viewing && state.viewing.posts) {
        state.viewing.posts = state.viewing.posts.filter(function (p) { return Number(p.id) !== id; });
      }
      var cards = root.querySelectorAll('.dbook-card[data-post-id="' + id + '"]');
      for (var i = 0; i < cards.length; i++) {
        try { var v = cards[i].querySelector('video'); if (v) { v.pause(); v.removeAttribute('src'); v.load(); } } catch (e) {}
        try { cards[i].remove(); } catch (e2) {}
      }
      if (cards.length && !root.querySelector('.dbook-card')) paint();
    }

    // ---------- «Me gusta» en fotos y vídeos ----------
    function paintLikeBtn(b, post) {
      var n = Number(post.likeCount) || 0;
      var liked = !!post.liked;
      b.textContent = (liked ? '❤️ ' : '🤍 ') + n + ' · ' + (liked ? 'Ya no me gusta' : 'Me gusta');
      b.title = liked ? 'Ya no me gusta' : 'Me gusta';
      b.setAttribute('aria-pressed', liked ? 'true' : 'false');
      b.style.color = liked ? '#ff9db0' : '';
    }
    function forEachPost(id, fn) {
      id = Number(id);
      var lists = [state.feed || []];
      if (state.viewing && state.viewing.posts) lists.push(state.viewing.posts);
      lists.forEach(function (list) {
        list.forEach(function (p) { if (Number(p.id) === id) fn(p); });
      });
    }
    function repaintLikes(id, src) {
      if (!src) forEachPost(id, function (p) { if (!src) src = p; });
      if (!src) return;
      var bs = root.querySelectorAll('.dbook-like[data-like-post-id="' + Number(id) + '"]');
      for (var i = 0; i < bs.length; i++) paintLikeBtn(bs[i], src);
    }
    async function toggleLike(post, b) {
      if (!state.me) { setMsg('Inicia sesión para dar me gusta', true); return; }
      if (b.disabled) return;
      var on = !post.liked;
      var prevCount = Number(post.likeCount) || 0;
      var prevLiked = !!post.liked;
      function apply(count, liked) {
        post.likeCount = count; post.liked = liked;
        forEachPost(post.id, function (p) { p.likeCount = count; p.liked = liked; });
        repaintLikes(post.id, post);
      }
      apply(Math.max(0, prevCount + (on ? 1 : -1)), on);
      b.disabled = true;
      try {
        var res = await api('/api/book/posts/' + post.id + '/like', { method: 'POST', body: { like: on } });
        apply(Number(res && res.likeCount) || 0, !!(res && res.liked));
      } catch (e) {
        apply(prevCount, prevLiked);
        if (e && e.code === 401) { onErr(e); return; }
        setMsg((e && e.message) || 'No se pudo dar me gusta', true);
      } finally {
        b.disabled = false;
      }
    }

    function postCard(post, opts) {
      opts = opts || {};
      var card = el('article', 'dbook-card');
      card.setAttribute('data-post-id', String(post.id));
      var head = el('div', 'dbook-card-head');
      var chMini = {
        photoUrl: post.channelPhotoUrl || null,
        owner: post.owner,
        title: post.channelTitle || '',
        handle: post.handle
      };
      for (var i = 0; i < state.channels.length; i++) {
        if (state.channels[i].handle === post.handle) {
          chMini = state.channels[i];
          break;
        }
      }
      if (state.viewing && state.viewing.channel && state.viewing.channel.handle === post.handle) {
        chMini = state.viewing.channel;
      }
      if (state.channel && state.channel.handle === post.handle) chMini = state.channel;
      if (!chMini.photoUrl && post.channelPhotoUrl) chMini.photoUrl = post.channelPhotoUrl;

      head.appendChild(channelAvatarNode(chMini, false));
      var meta = el('div', 'dbook-card-meta');
      var displayName = (chMini.title || post.channelTitle || (post.owner && post.owner.name) || 'Canal');
      var who = el('button', 'dbook-link', displayName + ' · @' + (post.handle || ''));
      who.type = 'button';
      who.addEventListener('click', function () { openChannel(post.handle); });
      meta.appendChild(who);
      var whenRow = el('div', 'dbook-muted');
      whenRow.appendChild(agoNode(post.createdAt));
      if (isDirectPost(post)) whenRow.appendChild(el('span', 'dbook-direct-chip', '🔴 Direct™'));
      meta.appendChild(whenRow);
      head.appendChild(meta);
      card.appendChild(head);
      card.appendChild(el('h3', 'dbook-card-title', post.title || 'Sin título'));
      if (post.description) card.appendChild(el('p', 'dbook-card-desc', post.description));

      var mediaWrap = el('div', 'dbook-media');
      var viewsEl = el('div', 'dbook-views', '👁 ' + fmtViews(post.views) + ' visitas');
      var counted = false;

      if (post.kind === 'video') {
        var vid = document.createElement('video');
        vid.src = post.mediaUrl;
        vid.controls = true;
        vid.playsInline = true;
        vid.preload = 'metadata';
        vid.className = 'dbook-video';
        // Etiqueta de calidad (4K / 1080p / 720p…) según la resolución real del vídeo
        vid.addEventListener('loadedmetadata', function () {
          var sd = Math.min(vid.videoWidth || 0, vid.videoHeight || 0);
          if (!sd || whenRow.querySelector('.dbook-q-chip')) return;
          var q = sd >= 2000 ? '4K' : sd >= 1400 ? '1440p' : sd >= 1000 ? '1080p' : sd >= 700 ? '720p' : sd >= 460 ? '480p' : sd + 'p';
          var chip = el('span', 'dbook-direct-chip dbook-q-chip', q);
          chip.title = vid.videoWidth + '×' + vid.videoHeight;
          whenRow.appendChild(chip);
        });
        function onPlay() {
          if (counted) return;
          counted = true;
          recordView(post, viewsEl);
        }
        vid.addEventListener('play', onPlay);
        vid.addEventListener('timeupdate', function () {
          if (!counted && vid.currentTime > 1) onPlay();
        });
        mediaWrap.appendChild(vid);
      } else {
        var img = document.createElement('img');
        img.src = post.mediaUrl;
        img.alt = post.title || '';
        img.className = 'dbook-image';
        img.loading = 'lazy';
        img.addEventListener('click', function () {
          if (!counted) { counted = true; recordView(post, viewsEl); }
          openLightbox(post);
        });
        if ('IntersectionObserver' in window) {
          var io = new IntersectionObserver(function (entries) {
            entries.forEach(function (en) {
              if (en.isIntersecting && !counted) {
                counted = true;
                recordView(post, viewsEl);
                io.disconnect();
              }
            });
          }, { threshold: 0.55 });
          io.observe(img);
        }
        mediaWrap.appendChild(img);
      }
      card.appendChild(mediaWrap);

      var metaRow = el('div', 'dbook-meta-row');
      metaRow.appendChild(viewsEl);
      var likeBtn = el('button', 'dbook-link dbook-like');
      likeBtn.type = 'button';
      likeBtn.setAttribute('data-like-post-id', String(post.id));
      paintLikeBtn(likeBtn, post);
      likeBtn.addEventListener('click', function (ev) { ev.preventDefault(); ev.stopPropagation(); toggleLike(post, likeBtn); });
      metaRow.appendChild(likeBtn);
      var cCount = Number(post.commentCount) || 0;
      var commentsBtn = el('button', 'dbook-link', '💬 ' + cCount + ' comentario' + (cCount === 1 ? '' : 's'));
      commentsBtn.type = 'button';
      metaRow.appendChild(commentsBtn);
      var shareBtn = el('button', 'dbook-link dbook-share', '🔗 Compartir');
      shareBtn.type = 'button';
      shareBtn.title = 'Copiar el enlace de esta publicación';
      shareBtn.addEventListener('click', function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        copyText(bookLink('post', post.id)).then(function () {
          shareBtn.textContent = '✔ Enlace copiado';
          setMsg('Enlace copiado: pégalo en Doganiero Chat o donde quieras');
          setTimeout(function () { shareBtn.textContent = '🔗 Compartir'; }, 1800);
        }).catch(function () { setMsg('No se pudo copiar el enlace', true); });
      });
      metaRow.appendChild(shareBtn);
      card.appendChild(metaRow);

      var isMine = !!(state.me && Number(state.me.id) === Number(post.userId));
      if (opts.canDelete || isMine) {
        var isVideo = post.kind === 'video';
        var del = el('button', 'dbook-btn ghost dbook-del', isVideo ? '🗑️ Eliminar vídeo' : '🗑️ Eliminar foto');
        del.type = 'button';
        del.style.borderColor = 'rgba(255,120,120,.55)';
        del.style.color = '#ffb3b3';
        del.addEventListener('click', async function () {
          if (!confirm(isVideo ? '¿Eliminar este vídeo? No se puede deshacer.' : '¿Eliminar esta foto? No se puede deshacer.')) return;
          del.disabled = true;
          var backupFeed = (state.feed || []).slice();
          var backupView = state.viewing && state.viewing.posts ? state.viewing.posts.slice() : null;
          dropPost(post.id);
          try {
            await api('/api/book/posts/' + post.id, { method: 'DELETE' });
            setMsg(isVideo ? 'Vídeo eliminado' : 'Foto eliminada');
            Promise.all([loadFeed(), loadChannels()]).catch(function () {});
          } catch (e) {
            // Si falla, vuelve a aparecer
            state.feed = backupFeed;
            if (backupView && state.viewing) state.viewing.posts = backupView;
            paint();
            setMsg((e && e.message) || 'No se pudo eliminar', true);
          }
        });
        metaRow.appendChild(del);
      }

      var commentsBox = el('div', 'dbook-comments');
      commentsBox.hidden = true;
      var form = el('div', 'dbook-comment-form');
      var input = document.createElement('input');
      input.type = 'text';
      input.placeholder = 'Escribe un comentario…';
      input.maxLength = 500;
      input.autocomplete = 'off';
      var send = el('button', 'dbook-btn', 'Comentar');
      send.type = 'button';
      form.appendChild(input);
      form.appendChild(send);
      commentsBox.appendChild(form);
      var commentsList = el('div', 'dbook-comments-list');
      commentsBox.appendChild(commentsList);
      card.appendChild(commentsBox);

      var loaded = false;
      var commentsOpen = false;

      function sortBar() {
        var bar = el('div', 'dbook-csort');
        bar.appendChild(el('span', 'dbook-muted', 'Ordenar:'));
        [['old', 'Más antiguos'], ['new', 'Más recientes']].forEach(function (o) {
          var on = getCSort() === o[0];
          var b = el('button', 'dbook-csort-btn' + (on ? ' on' : ''), o[1]);
          b.type = 'button';
          b.setAttribute('aria-pressed', on ? 'true' : 'false');
          b.addEventListener('click', function (ev) {
            ev.preventDefault();
            ev.stopPropagation();
            if (getCSort() === o[0]) return;
            setCSort(o[0]);
            loadComments();
          });
          bar.appendChild(b);
        });
        return bar;
      }

      async function loadComments() {
        commentsList.innerHTML = '';
        commentsList.appendChild(el('p', 'dbook-muted', 'Cargando comentarios…'));
        try {
          var data = await api('/api/book/posts/' + post.id + '/comments');
          var list = data.comments || [];
          post.commentCount = list.length;
          commentsBtn.textContent = '💬 ' + list.length + ' comentario' + (list.length === 1 ? '' : 's');
          commentsList.innerHTML = '';
          if (!list.length) {
            commentsList.appendChild(el('p', 'dbook-muted', 'Sé el primero en comentar.'));
          } else {
            var sortedC = list.slice().sort(function (a, b) {
              var d = (Number(a.createdAt) || 0) - (Number(b.createdAt) || 0);
              return getCSort() === 'new' ? -d : d;
            });
            if (sortedC.length > 1) commentsList.appendChild(sortBar());
            sortedC.forEach(function (c) {
              var row = el('div', 'dbook-comment');
              var whoName = (c.handle ? '@' + c.handle : ((c.author && c.author.name) || 'Usuario'));
              var top = el('div', 'dbook-comment-top');
              top.appendChild(el('strong', null, whoName));
              top.appendChild(el('span', 'dbook-muted', ' · '));
              top.appendChild(agoNode(c.createdAt, 'dbook-muted'));
              row.appendChild(top);
              row.appendChild(el('p', null, c.body));
              var canDel = state.me && (Number(state.me.id) === Number(c.userId) || Number(state.me.id) === Number(post.userId));
              if (canDel) {
                var dbtn = el('button', 'dbook-link', 'Borrar');
                dbtn.type = 'button';
                dbtn.addEventListener('click', async function (ev) {
                  ev.preventDefault();
                  ev.stopPropagation();
                  try {
                    await api('/api/book/comments/' + c.id, { method: 'DELETE' });
                    await loadComments();
                  } catch (e) { setMsg(e.message || 'No se pudo borrar', true); }
                });
                row.appendChild(dbtn);
              }
              commentsList.appendChild(row);
            });
          }
          loaded = true;
        } catch (e) {
          commentsList.innerHTML = '';
          var errP = el('p', 'dbook-muted', (e.message || 'No se pudieron cargar los comentarios') + ' ');
          var rty = el('button', 'dbook-link', '🔄 Reintentar');
          rty.type = 'button';
          rty.addEventListener('click', function (ev) { ev.preventDefault(); ev.stopPropagation(); loadComments(); });
          errP.appendChild(rty);
          commentsList.appendChild(errP);
        }
      }

      function setCommentsOpen(open) {
        commentsOpen = !!open;
        commentsBox.hidden = !commentsOpen;
        commentsBox.classList.toggle('open', commentsOpen);
        commentsBtn.setAttribute('aria-expanded', commentsOpen ? 'true' : 'false');
        if (commentsOpen) {
          if (!loaded) loadComments();
          try {
            commentsBox.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
          } catch (eScroll) {
            try { commentsBox.scrollIntoView(false); } catch (e2) {}
          }
          setTimeout(function () {
            try { input.focus(); } catch (eF) {}
          }, 30);
        }
      }

      commentsBtn.setAttribute('aria-expanded', 'false');
      commentsBtn.addEventListener('click', function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        setCommentsOpen(!commentsOpen);
      });

      async function submitComment() {
        if (send.disabled) return;
        var text = (input.value || '').trim();
        if (!text) {
          try { input.focus(); } catch (e0) {}
          return;
        }
        send.disabled = true;
        try {
          await api('/api/book/posts/' + post.id + '/comments', {
            method: 'POST',
            body: JSON.stringify({ body: text })
          });
          input.value = '';
          setCommentsOpen(true);
          loaded = false;
          await loadComments();
          setMsg('Comentario publicado');
          try { input.focus(); } catch (e1) {}
        } catch (e) {
          setMsg(e.message || 'No se pudo comentar', true);
        }
        send.disabled = false;
      }
      send.addEventListener('click', function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        submitComment();
      });
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); submitComment(); }
      });

      return card;
    }

    function openLightbox(post) {
      var ov = el('div', 'dbook-lightbox');
      var img = document.createElement('img');
      img.src = post.mediaUrl;
      img.alt = post.title || '';
      ov.appendChild(img);
      function closeLb() {
        document.removeEventListener('keydown', onLbKey, true);
        ov.remove();
      }
      function onLbKey(e) { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeLb(); } }
      ov.className += ' dbook-lb-esc';
      ov.title = 'Pulsa para cerrar (Esc)';
      ov.addEventListener('click', closeLb);
      document.addEventListener('keydown', onLbKey, true);
      root.appendChild(ov);
    }

    function bindPhotoInput(fileInput, previewEl) {
      fileInput.accept = 'image/*';
      fileInput.addEventListener('change', async function () {
        state.pendingPhotoDataUrl = null;
        state.pendingPhotoPreview = null;
        if (!fileInput.files || !fileInput.files[0]) {
          if (previewEl) previewEl.innerHTML = '';
          return;
        }
        var f = fileInput.files[0];
        if (f.type.indexOf('image/') !== 0) {
          setMsg('La foto del canal debe ser una imagen', true);
          fileInput.value = '';
          return;
        }
        if (f.size > 8 * 1024 * 1024) {
          setMsg('Foto máx. 8 MB', true);
          fileInput.value = '';
          return;
        }
        try {
          var dataUrl = await fileToDataUrl(f);
          state.pendingPhotoDataUrl = dataUrl;
          state.pendingPhotoPreview = dataUrl;
          if (previewEl) {
            previewEl.innerHTML = '';
            var im = document.createElement('img');
            im.src = dataUrl;
            im.className = 'dbook-photo-preview';
            previewEl.appendChild(im);
          }
        } catch (e) {
          setMsg(e.message || 'No se pudo leer la foto', true);
        }
      });
    }

    function channelForm(opts) {
      opts = opts || {};
      var isEdit = !!opts.edit;
      var form = el('div', 'dbook-form');
      var handle = document.createElement('input');
      handle.placeholder = 'handle (ej: david)';
      handle.maxLength = 24;
      if (isEdit && state.channel) handle.value = state.channel.handle;
      var title = document.createElement('input');
      title.placeholder = 'Nombre del canal';
      title.maxLength = 60;
      if (isEdit && state.channel) title.value = state.channel.title;
      var bio = document.createElement('textarea');
      bio.placeholder = 'Bio (opcional)';
      bio.rows = 3;
      bio.maxLength = 280;
      if (isEdit && state.channel) bio.value = state.channel.bio || '';

      var photoLabel = el('label', 'dbook-muted', 'Foto del canal (opcional — sube una imagen)');
      var photo = document.createElement('input');
      photo.type = 'file';
      var preview = el('div', 'dbook-photo-preview-wrap');
      if (isEdit && state.channel && state.channel.photoUrl) {
        var im = document.createElement('img');
        im.src = state.channel.photoUrl;
        im.className = 'dbook-photo-preview';
        preview.appendChild(im);
      }
      bindPhotoInput(photo, preview);

      form.appendChild(handle);
      form.appendChild(title);
      form.appendChild(bio);
      form.appendChild(photoLabel);
      form.appendChild(photo);
      form.appendChild(preview);

      var save = el('button', 'dbook-btn', isEdit ? 'Guardar canal' : 'Crear canal');
      save.type = 'button';
      save.addEventListener('click', async function () {
        save.disabled = true;
        save.textContent = 'Guardando…';
        try {
          var payload = {
            handle: handle.value,
            title: title.value,
            bio: bio.value
          };
          if (state.pendingPhotoDataUrl) payload.photoDataUrl = state.pendingPhotoDataUrl;
          state.channel = await api('/api/book/channel', {
            method: 'POST',
            body: JSON.stringify(payload)
          });
          // Releer del servidor para confirmar persistencia tras reinicio
          try {
            var me = await api('/api/book/me');
            if (me && me.channel) state.channel = me.channel;
            state.me = me.user || state.me;
          } catch (eMe) {}
          state.pendingPhotoDataUrl = null;
          setMsg(isEdit ? 'Canal guardado (se mantiene al reiniciar)' : ('Canal @' + state.channel.handle + ' creado y guardado'));
          try {
            var inboxData = await api('/api/book/inbox');
            state.inbox = inboxData.messages || [];
            state.inboxUnread = inboxData.unread || 0;
          } catch (eI) {}
          try { await loadChannels(); } catch (eCh) {}
          paint();
        } catch (e) {
          setMsg(e.message || 'Error al guardar el canal', true);
          save.disabled = false;
          save.textContent = isEdit ? 'Guardar canal' : 'Crear canal';
        }
      });
      form.appendChild(save);
      return form;
    }

    function paint() {
      // Para Direct™: avisar a doganiero-book-live.js de si este perfil tiene canal
      try { window.dispatchEvent(new CustomEvent('dbook:me', { detail: { me: state.me, hasChannel: !!state.channel } })); } catch (eEv) {}
      root.innerHTML = '';
      if (!state.me) {
        paintLoginGate();
        return;
      }

      var top = el('div', 'dbook-top');
      var titleRow = el('div', 'dbook-title-row');
      titleRow.appendChild(bookLogoNode());
      var inboxBtn = el('button', 'dbook-btn ghost dbook-inbox-btn', '📬 Bandeja' + (state.inboxUnread ? ' (' + state.inboxUnread + ')' : ''));
      inboxBtn.type = 'button';
      inboxBtn.addEventListener('click', function () {
        state.showInbox = true;
        paint();
      });
      titleRow.appendChild(inboxBtn);
      top.appendChild(titleRow);
      top.appendChild(el('div', 'dbook-sub', 'Canales · fotos · vídeos · visitas reales'));
      root.appendChild(top);

      var nav = el('nav', 'dbook-nav');
      [
        ['feed', 'Inicio'],
        ['channels', 'Canales'],
        ['mine', 'Mi canal'],
        ['publish', 'Publicar']
      ].forEach(function (pair) {
        var b = el('button', 'dbook-tab' + (state.tab === pair[0] ? ' on' : ''), pair[1]);
        b.type = 'button';
        b.addEventListener('click', function () {
          state.tab = pair[0];
          if (pair[0] !== 'channel') state.viewing = null;
          // sin canal: Publicar no deja publicar (se pinta bloqueo)
          paint();
          if (pair[0] === 'feed') loadFeed().then(paint).catch(onErr);
          if (pair[0] === 'channels') loadChannels().then(paint).catch(onErr);
        });
        nav.appendChild(b);
      });
      root.appendChild(nav);

      var msg = el('div', 'dbook-msg');
      msg.setAttribute('data-db', 'msg');
      if (state.msg) {
        msg.textContent = state.msg;
        msg.className = 'dbook-msg' + (state.msg.indexOf('Error') >= 0 || state.msg.indexOf('Máx') >= 0 || state.msg.indexOf('debe') >= 0 || state.msg.indexOf('No ') === 0 ? ' err' : '');
      }
      root.appendChild(msg);

      var body = el('div', 'dbook-body');
      root.appendChild(body);

      if (state.tab === 'feed') {
        var sub = el('div', 'dbook-subtabs');
        [['all', '🏠 Inicio'], ['following', '⭐ Siguiendo' + (state.follows.length ? ' (' + state.follows.length + ')' : '')]].forEach(function (o) {
          var on = state.feedMode === o[0];
          var sb = el('button', 'dbook-subtab' + (on ? ' on' : ''), o[1]);
          sb.type = 'button';
          sb.setAttribute('aria-pressed', on ? 'true' : 'false');
          sb.addEventListener('click', function () { state.feedMode = o[0]; paint(); if (o[0] === 'following') loadFollowFeed(); });
          sub.appendChild(sb);
        });
        body.appendChild(sub);
        var feedList = state.feed;
        if (state.feedMode === 'following') {
          var fKey = state.follows.slice(0, 20).join(',');
          if (state.followFeed && state.followFeedKey === fKey) {
            feedList = state.followFeed.filter(function (p) { return isFollowing(p.handle); });
          } else {
            feedList = state.feed.filter(function (p) { return isFollowing(p.handle); });
            if (state.follows.length) setTimeout(loadFollowFeed, 0);
          }
        }
        if (!feedList.length) {
          if (state.feedMode === 'following') {
            var emp = el('div', 'dbook-empty');
            emp.appendChild(el('p', null, state.follows.length
              ? 'Los canales que sigues aún no han publicado nada reciente.'
              : 'Aún no sigues ningún canal. Abre uno y pulsa «➕ Seguir» para ver aquí lo que publica.'));
            var goCh = el('button', 'dbook-btn', 'Explorar canales');
            goCh.type = 'button';
            goCh.addEventListener('click', function () {
              state.tab = 'channels';
              paint();
              loadChannels().then(paint).catch(onErr);
            });
            emp.appendChild(goCh);
            body.appendChild(emp);
          } else {
            body.appendChild(el('p', 'dbook-empty', 'Aún no hay publicaciones. ¡Sé el primero en crear un canal y subir algo!'));
          }
        } else {
          feedList.forEach(function (p) { body.appendChild(postCard(p)); });
        }
      } else if (state.tab === 'channels') {
        if (!state.channels.length) {
          body.appendChild(el('p', 'dbook-empty', 'No hay canales todavía.'));
        } else {
          state.channels.forEach(function (ch) {
            var row = el('button', 'dbook-channel-row');
            row.type = 'button';
            row.appendChild(channelAvatarNode(ch, false));
            var info = el('div');
            info.appendChild(el('strong', null, ch.title));
            var pc = Number(ch.postCount) || 0;
            var lineC = el('div', 'dbook-muted', '@' + ch.handle + ' · ' + pc + (pc === 1 ? ' publicación' : ' publicaciones'));
            if (isFollowing(ch.handle)) lineC.appendChild(el('span', 'dbook-follow-chip', 'Siguiendo'));
            info.appendChild(lineC);
            if (ch.bio) info.appendChild(el('div', 'dbook-muted', ch.bio));
            row.appendChild(info);
            row.addEventListener('click', function () { openChannel(ch.handle); });
            body.appendChild(row);
          });
        }
      } else if (state.tab === 'channel' && state.viewing) {
        var ch = state.viewing.channel;
        var mine = !!(state.me && Number(state.me.id) === Number(ch.userId));
        var back = el('button', 'dbook-link dbook-back', '← Canales');
        back.type = 'button';
        back.addEventListener('click', function () {
          state.tab = 'channels';
          state.viewing = null;
          paint();
          loadChannels().then(paint).catch(onErr);
        });
        body.appendChild(back);
        var head = el('div', 'dbook-channel-head dbook-ch-hero');
        head.appendChild(channelAvatarNode(ch, true));
        var hi = el('div', 'dbook-ch-info');
        hi.appendChild(el('h2', null, ch.title));
        hi.appendChild(el('div', 'dbook-muted', '@' + ch.handle + ((ch.owner && ch.owner.name) ? ' · ' + ch.owner.name : '')));
        if (ch.bio) hi.appendChild(el('p', 'dbook-ch-bio', ch.bio));
        var statsEl = el('div', 'dbook-ch-stats');
        statsEl.setAttribute('data-db', 'ch-stats');
        hi.appendChild(statsEl);
        var acts = el('div', 'dbook-ch-actions');
        if (!mine) {
          var fbtn = el('button', 'dbook-btn dbook-follow', '➕ Seguir');
          fbtn.type = 'button';
          fbtn.setAttribute('data-db', 'follow');
          fbtn.addEventListener('click', function () { toggleFollow(ch, fbtn); });
          acts.appendChild(fbtn);
        } else {
          var edb = el('button', 'dbook-btn ghost', '✏️ Editar mi canal');
          edb.type = 'button';
          edb.addEventListener('click', function () { state.tab = 'mine'; state.viewing = null; paint(); });
          acts.appendChild(edb);
        }
        var shc = el('button', 'dbook-btn ghost', '🔗 Compartir canal');
        shc.type = 'button';
        shc.addEventListener('click', function () {
          copyText(bookLink('canal', ch.handle)).then(function () {
            shc.textContent = '✔ Enlace copiado';
            setMsg('Enlace del canal copiado');
            setTimeout(function () { shc.textContent = '🔗 Compartir canal'; }, 1800);
          }).catch(function () { setMsg('No se pudo copiar el enlace', true); });
        });
        acts.appendChild(shc);
        hi.appendChild(acts);
        head.appendChild(hi);
        body.appendChild(head);
        paintChannelStats();
        var directs = state.viewing.posts.filter(isDirectPost);
        var ctabs = el('div', 'dbook-subtabs');
        [['posts', '📷 Publicaciones (' + state.viewing.posts.length + ')'], ['direct', '🔴 Direct™ guardados (' + directs.length + ')']].forEach(function (o) {
          var on = state.chTab === o[0];
          var tb = el('button', 'dbook-subtab' + (on ? ' on' : ''), o[1]);
          tb.type = 'button';
          tb.setAttribute('aria-pressed', on ? 'true' : 'false');
          tb.addEventListener('click', function () {
            state.chTab = o[0];
            var keep = root.querySelector('.dbook-body');
            var y = keep ? keep.scrollTop : 0;
            paint();
            try { var nb = root.querySelector('.dbook-body'); if (nb) nb.scrollTop = y; } catch (eY) {}
          });
          ctabs.appendChild(tb);
        });
        body.appendChild(ctabs);
        var listP = state.chTab === 'direct' ? directs : state.viewing.posts;
        if (!listP.length) {
          body.appendChild(el('p', 'dbook-empty', state.chTab === 'direct'
            ? (mine ? 'Aún no has guardado ningún Direct™. Cuando termines uno, se guarda completo aquí con su chat.' : 'Este canal aún no tiene Direct™ guardados.')
            : 'Este canal todavía no tiene contenido.'));
        } else {
          listP.forEach(function (p) {
            body.appendChild(postCard(p, { canDelete: mine }));
          });
        }
      } else if (state.tab === 'mine') {
        paintMine(body);
      } else if (state.tab === 'publish') {
        paintPublish(body);
      }

      if (state.showInbox) paintInboxOverlay();
    }

    function paintMine(body) {
      if (!state.channel) {
        var box = el('div', 'dbook-need-channel');
        box.appendChild(el('h3', null, 'Crea tu canal para continuar'));
        box.appendChild(el('p', null, 'Sin canal no puedes publicar fotos ni vídeos. Elige un handle, un nombre y, si quieres, una foto de canal.'));
        body.appendChild(box);
        body.appendChild(channelForm({ edit: false }));
        return;
      }

      var head = el('div', 'dbook-channel-head dbook-ch-hero');
      head.appendChild(channelAvatarNode(state.channel, true));
      var hi = el('div');
      hi.appendChild(el('h2', null, state.channel.title));
      hi.appendChild(el('div', 'dbook-muted', '@' + state.channel.handle));
      if (state.channel.bio) hi.appendChild(el('p', null, state.channel.bio));
      head.appendChild(hi);
      body.appendChild(head);

      body.appendChild(el('h3', null, 'Editar canal'));
      body.appendChild(channelForm({ edit: true }));

      var open = el('button', 'dbook-btn ghost', 'Ver mi canal público');
      open.type = 'button';
      open.addEventListener('click', function () { openChannel(state.channel.handle).catch(onErr); });
      var mineActs = el('div', 'dbook-ch-actions');
      mineActs.appendChild(open);
      var dirB = el('button', 'dbook-btn ghost', '🔴 Mis Direct™ guardados');
      dirB.type = 'button';
      dirB.addEventListener('click', function () { openChannel(state.channel.handle, { chTab: 'direct' }).catch(onErr); });
      mineActs.appendChild(dirB);
      var shareMine = el('button', 'dbook-btn ghost', '🔗 Compartir mi canal');
      shareMine.type = 'button';
      shareMine.addEventListener('click', function () {
        copyText(bookLink('canal', state.channel.handle)).then(function () { setMsg('Enlace de tu canal copiado'); }).catch(function () { setMsg('No se pudo copiar el enlace', true); });
      });
      mineActs.appendChild(shareMine);
      body.insertBefore(mineActs, head.nextSibling);
    }

    function paintPublish(body) {
      if (!state.channel) {
        var box = el('div', 'dbook-need-channel');
        box.appendChild(el('h3', null, 'Necesitas un canal'));
        box.appendChild(el('p', null, 'No se pueden publicar fotos ni vídeos hasta que crees tu canal.'));
        var go = el('button', 'dbook-btn', 'Crear canal ahora');
        go.type = 'button';
        go.addEventListener('click', function () {
          state.tab = 'mine';
          paint();
        });
        box.appendChild(go);
        body.appendChild(box);
        return;
      }
      body.appendChild(el('h3', null, 'Nueva publicación'));
      body.appendChild(el('p', 'dbook-muted', 'Imagen (máx. 40 MB) o vídeo de hasta 30 min (máx. 100 MB). Las visitas se cuentan al ver el contenido.'));
      var form = el('div', 'dbook-form');
      var kind = document.createElement('select');
      [['image', 'Imagen'], ['video', 'Vídeo']].forEach(function (o) {
        var opt = document.createElement('option');
        opt.value = o[0]; opt.textContent = o[1];
        kind.appendChild(opt);
      });
      var title = document.createElement('input');
      title.placeholder = 'Título';
      title.maxLength = 100;
      var desc = document.createElement('textarea');
      desc.placeholder = 'Descripción (opcional)';
      desc.rows = 3;
      var file = document.createElement('input');
      file.type = 'file';
      file.accept = 'image/*,video/*';
      form.appendChild(kind);
      form.appendChild(title);
      form.appendChild(desc);
      form.appendChild(file);
      // Vista previa del archivo elegido (y tipo/título automáticos)
      var prev = el('div', 'dbook-pub-preview');
      prev.hidden = true;
      prev.style.cssText = 'margin:2px 0 4px;border-radius:12px;overflow:hidden;background:rgba(0,0,0,.35);border:1px solid rgba(255,255,255,.12);text-align:center;';
      form.appendChild(prev);
      var prevUrl = '';
      file.addEventListener('change', function () {
        if (prevUrl) { try { URL.revokeObjectURL(prevUrl); } catch (eR) {} prevUrl = ''; }
        prev.innerHTML = '';
        var f0 = file.files && file.files[0];
        if (!f0) { prev.hidden = true; return; }
        var isVid = String(f0.type || '').indexOf('video/') === 0;
        var isImg = String(f0.type || '').indexOf('image/') === 0;
        if (isVid) kind.value = 'video'; else if (isImg) kind.value = 'image';
        if (!title.value.trim() && f0.name) title.value = String(f0.name).replace(/\.[a-z0-9]{1,5}$/i, '').replace(/[_-]+/g, ' ').slice(0, 100);
        try { prevUrl = URL.createObjectURL(f0); } catch (eU) { prevUrl = ''; }
        if (prevUrl && (isImg || isVid)) {
          var m = document.createElement(isVid ? 'video' : 'img');
          m.src = prevUrl;
          if (isVid) { m.muted = true; m.controls = true; m.preload = 'metadata'; m.setAttribute('playsinline', ''); }
          else m.alt = 'Vista previa';
          m.style.cssText = 'display:block;max-width:100%;max-height:220px;margin:0 auto;object-fit:contain;';
          prev.appendChild(m);
        }
        var cap = el('div', 'dbook-muted', (f0.name || 'archivo') + ' · ' + (f0.size >= 1048576 ? (Math.round(f0.size / 104857.6) / 10).toString().replace('.', ',') + ' MB' : Math.max(1, Math.round(f0.size / 1024)) + ' KB'));
        cap.style.cssText = 'padding:6px 10px;font-size:.75rem;';
        prev.appendChild(cap);
        prev.hidden = false;
      });
      var pub = el('button', 'dbook-btn', 'Publicar');
      pub.type = 'button';
      pub.addEventListener('click', async function () {
        if (!state.channel) {
          setMsg('Crea tu canal antes de publicar', true);
          state.tab = 'mine';
          paint();
          return;
        }
        if (!file.files || !file.files[0]) {
          setMsg('Elige una imagen o un vídeo', true);
          return;
        }
        var f = file.files[0];
        var k = kind.value;
        if (k === 'image' && f.type.indexOf('image/') !== 0) {
          setMsg('El archivo no es una imagen', true); return;
        }
        if (k === 'video' && f.type.indexOf('video/') !== 0) {
          setMsg('El archivo no es un vídeo', true); return;
        }
        if (k === 'image' && f.size > BOOK_IMAGE_MAX_BYTES) {
          setMsg('Imagen: máximo 40 MB', true); return;
        }
        if (k === 'video' && f.size > BOOK_VIDEO_MAX_BYTES) {
          setMsg('Vídeo: máximo 100 MB (hasta 30 min)', true); return;
        }
        pub.disabled = true;
        pub.textContent = k === 'video' ? 'Comprobando vídeo…' : 'Subiendo…';
        try {
          var durationSec = null;
          if (k === 'video') {
            durationSec = await getVideoDurationSec(f);
            if (durationSec > BOOK_VIDEO_MAX_SEC + 1) {
              setMsg('El vídeo no puede durar más de 30 minutos', true);
              pub.disabled = false;
              pub.textContent = 'Publicar';
              return;
            }
            pub.textContent = 'Subiendo vídeo…';
          }
          var fd = new FormData();
          fd.append('kind', k);
          fd.append('title', title.value || f.name || 'Sin título');
          fd.append('description', desc.value || '');
          if (durationSec != null) fd.append('durationSec', String(durationSec));
          fd.append('file', f, f.name || ('upload.' + (k === 'video' ? 'mp4' : 'jpg')));
          var post = await api('/api/book/posts/upload', {
            method: 'POST',
            body: fd
          });
          setMsg('Publicado: ' + (post.title || ''));
          state.tab = 'feed';
          await loadFeed();
          paint();
        } catch (e) {
          setMsg(e.message || 'No se pudo publicar', true);
          pub.disabled = false;
          pub.textContent = 'Publicar';
        }
      });
      form.appendChild(pub);
      body.appendChild(form);
    }

    function onErr(e) {
      if (e && e.code === 401) {
        state.me = null;
        paintLoginGate();
        return;
      }
      if (!root.querySelector('.dbook-top')) {
        root.innerHTML = '';
        var eb = el('div', 'dbook-gate');
        eb.appendChild(bookLogoNode());
        eb.appendChild(el('p', null, 'No se pudo cargar DoganieroBook. Comprueba tu conexión e inténtalo de nuevo.'));
        var rb = el('button', 'dbook-btn', '🔄 Reintentar');
        rb.type = 'button';
        rb.addEventListener('click', function () {
          root.innerHTML = '';
          root.appendChild(el('div', 'dbook-loading', 'Cargando DoganieroBook…'));
          reloadAll().catch(onErr);
        });
        eb.appendChild(rb);
        root.appendChild(eb);
        return;
      }
      setMsg((e && e.message) || 'Error de red', true);
    }

    async function reloadAll() {
      await refreshMe();
      await loadFeed();
      await loadChannels();
      await loadFollows();
      paint();
    }

    root.appendChild(el('div', 'dbook-loading', 'Cargando DoganieroBook…'));
    refreshMe()
      .then(function () { return Promise.all([loadFeed(), loadChannels(), loadFollows()]); })
      .then(function () {
        state.showInbox = true; // siempre al entrar (salvo si llegas por un enlace compartido)
        paint();
        handleDeepLink();
      })
      .catch(onErr);

    function onRemoteDelete(ev) {
      var id = ev && ev.detail ? ev.detail.postId : null;
      if (id != null) dropPost(id);
    }
    window.addEventListener('dbook:post-deleted', onRemoteDelete);
    // «Me gusta» de otros perfiles en tiempo real
    function onRemoteLikes(ev) {
      var d = ev && ev.detail ? ev.detail : null;
      if (!d || d.postId == null) return;
      var n = Number(d.likeCount) || 0;
      forEachPost(d.postId, function (p) { p.likeCount = n; });
      repaintLikes(d.postId);
    }
    window.addEventListener('dbook:post-likes', onRemoteLikes);
    // Abrir una pestaña desde fuera (p. ej. «Crear mi canal» en Direct™)
    function onOpenTab(ev) {
      var tab = ev && ev.detail ? ev.detail.tab : null;
      if (!tab || !state.me) return;
      state.tab = tab;
      state.viewing = null;
      state.showInbox = false;
      paint();
      try { root.scrollTop = 0; var b = root.querySelector('.dbook-body'); if (b) b.scrollTop = 0; } catch (eS) {}
    }
    window.addEventListener('dbook:open-tab', onOpenTab);
    function onHash() { if (state.me && handleDeepLink()) paint(); }
    window.addEventListener('hashchange', onHash);
    var agoTimer = setInterval(function () {
      var ns = root.querySelectorAll('[data-ago]');
      for (var i = 0; i < ns.length; i++) ns[i].textContent = fmtAgo(Number(ns[i].getAttribute('data-ago')));
    }, 60000);

    return function cleanup() {
      window.removeEventListener('dbook:post-deleted', onRemoteDelete);
      window.removeEventListener('dbook:post-likes', onRemoteLikes);
      window.removeEventListener('dbook:open-tab', onOpenTab);
      window.removeEventListener('hashchange', onHash);
      clearInterval(agoTimer);
      try { root.innerHTML = ''; } catch (e) {}
    };
  }

  window.renderDoganieroBookApp = renderDoganieroBookApp;

  // Si se abre Snake OS con un enlace de DoganieroBook, abrir la app tras iniciar sesión
  (function bookDeepLinkBoot() {
    if (!/^#book\/(post|canal)\//.test(location.hash || '')) return;
    var tries = 0;
    var t = setInterval(function () {
      tries++;
      if (tries > 400 || !/^#book\//.test(location.hash || '')) { clearInterval(t); return; }
      var u = window.currentUser;
      var desk = document.getElementById('desktop');
      if (!u || !u.email || !desk || desk.classList.contains('hidden') || typeof window.openApp !== 'function') return;
      clearInterval(t);
      try { window.openApp('doganiero-book'); } catch (e) {}
    }, 800);
  })();
})();
