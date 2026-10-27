/* Snake OS: tarjeta Doganiero Points™, Doganiero+ y cuota de nube (20 GB / 128 GB) dentro de «Mi perfil».
   Los datos y el saldo vienen del servidor (/api/doga/account con la sesión de Snake OS). */
(function(){
  function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
  function gb(b){return (b/1073741824).toFixed(b<10737418240?2:1)+' GB'}
  function site(sub,port){var h=location.hostname;return /softportweb\.com$/.test(h)?'https://'+sub+'.softportweb.com/':location.protocol+'//'+h+':'+port+'/'}
  async function j(url,opt){var r=await fetch(url,Object.assign({credentials:'same-origin',headers:{'content-type':'application/json'}},opt||{}));var d={};try{d=await r.json()}catch(e){}if(!r.ok)throw new Error(d.detail||('Error '+r.status));return d}
  async function mount(el){
    if(!el) return;
    el.innerHTML='<div style="opacity:.7;font-size:12px;padding:6px 0">Cargando tarjeta Points™…</div>';
    var a; try{a=await j('/api/doga/account')}catch(e){el.innerHTML='';return}
    if(a.prefs && a.prefs.show_card_in_os===false){el.innerHTML='';return}
    var p=a.plus,q=a.quota,pc=Math.min(100,q.used/q.limit*100);
    el.innerHTML='<div style="border-radius:16px;padding:14px;margin:4px 0 12px;color:#fff;background:linear-gradient(135deg,'+(p.active?'#3a2500,#ff8a00 60%,#ffcf3f':'#0b1a4acc,#2f6bffcc 55%,#7a3cffcc')+');box-shadow:0 8px 24px #0005;backdrop-filter:blur(14px)">'+
      '<div style="display:flex;justify-content:space-between;font-weight:700;font-size:13px"><span>💳 Doganiero Points™</span><span>'+(p.active?'➕ Doganiero+':'')+'</span></div>'+
      '<div style="font-size:30px;font-weight:800;margin:6px 0 0">'+a.card.balance+' <small style="font-size:13px">Points™</small></div>'+
      '<div style="font-family:monospace;letter-spacing:2px;font-size:12px;opacity:.9">'+esc(a.card.card_no)+'</div></div>'+
      '<div style="font-size:12px;margin-bottom:4px">☁️ Nube: '+gb(q.used)+' de '+(q.limit/1073741824)+' GB</div>'+
      '<div style="height:6px;border-radius:9px;background:rgba(255,255,255,.15);overflow:hidden;margin-bottom:8px"><i style="display:block;height:100%;width:'+pc.toFixed(2)+'%;background:#4b8bff"></i></div>'+
      '<div style="font-size:12px;opacity:.85;margin-bottom:8px">'+(p.active?('Doganiero+ activo hasta el '+new Date(p.until*1000).toLocaleDateString('es-ES')+(p.auto_renew?' (se renueva solo)':' (sin renovación)')):('Con '+p.cost+' Points™ activas Doganiero+ y tu nube pasa de 20 GB a 128 GB.'))+'</div>'+
      '<div style="display:flex;gap:6px;flex-wrap:wrap">'+
      (!p.active?'<button type="button" data-h="sub" '+(a.card.balance<p.cost?'disabled title="Te faltan '+(p.cost-a.card.balance)+' Points™"':'')+'>➕ Activar Doganiero+</button>':'')+
      '<a href="'+site('doganiero-games',8993)+'" target="_blank" rel="noopener" class="link-btn">🎮 Ganar Points™</a>'+
      '<a href="'+site('dogaemail',8992)+'" target="_blank" rel="noopener" class="link-btn">📧 Dogaemail ('+(a.unread||0)+')</a></div>'+
      '<div class="status" data-h="st"></div><hr style="border:none;border-top:1px solid rgba(255,255,255,0.12);margin:12px 0 6px">';
    var b=el.querySelector('[data-h=sub]');
    if(b) b.onclick=async function(){b.disabled=true;try{await j('/api/doga/plus/subscribe',{method:'POST'});mount(el)}catch(e){var s=el.querySelector('[data-h=st]');s.textContent=e.message;s.className='status show err';b.disabled=false}};
  }
  window.DogaHubOS={mount:mount};
})();
