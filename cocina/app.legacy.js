/* cocina/app.legacy.js — ES5 (hard-fix anti fantasmas + guard correcto) */

(function(){
  // === Guard: evita inicializar dos veces ===
  if (window.__KITCHEN_BOOTED__) {
    console.warn('[cocina] ya inicializado, ignorando segunda carga');
    return; // ¡esto SÍ detiene el resto!
  }
  window.__KITCHEN_BOOTED__ = 'legacy';

  if (!window.DB) { console.warn('[cocina.legacy] DB no listo aún'); }

  var DB = window.DB || {};
  var toast = window.toast || function(s){ try{console.log('toast:',s);}catch(_){ } };
  var beep  = window.beep  || function(){};

  // ===== Estado local =====
  var Status = { PENDING:'PENDING', IN_PROGRESS:'IN_PROGRESS', READY:'READY', DELIVERED:'DELIVERED', CANCELLED:'CANCELLED', DONE:'DONE', PAID:'PAID' };
  var CURRENT_LIST = [];
  var LOCALLY_TAKEN = {};
  var AUTO_ARCH = {}; // evita archivar dos veces la misma orden

  function now(){ return new Date(); }
  function toMs(t){
    if (!t) return 0;
    if (t && typeof t.toMillis==='function') return t.toMillis();
    if (t && typeof t.seconds!=='undefined') return (t.seconds*1000) + Math.floor((t.nanoseconds||0)/1e6);
    var d = new Date(t); var ms = d.getTime(); return isFinite(ms)?ms:0;
  }
  function fmtMMSS(ms){
    var s=Math.max(0, Math.floor(ms/1000)), m=Math.floor(s/60), ss=s%60;
    return (m<10?'0':'')+m+':'+(ss<10?'0':'')+ss;
  }
  function money(n){ return '$'+Number(n||0).toFixed(0); }
  function escapeHtml(s){
    return String(s||'').replace(/[&<>"']/g, function(m){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]; });
  }

  // ==== Normalizadores (ultra-robustos) ====
  function normStatus(s){
    s = String(s || '').trim().toUpperCase();
    return s || 'PENDING';
  }
  function isPaid(o){
    if (!o) return false;
    var raw = (o.paid != null ? o.paid : null);
    if (raw == null && o.payment && o.payment.paid != null) raw = o.payment.paid;
    if (raw == null && o.meta && o.meta.paid != null)       raw = o.meta.paid;
    if (raw == null && o.payStatus != null)                 raw = o.payStatus;
    if (raw === true || raw === 1) return true;
    if (typeof raw === 'string'){
      var s = raw.trim().toLowerCase();
      if (s === 'true' || s === '1' || s === 'paid' || s === 'pagado' || s === 'sí' || s === 'si' || s === 'yes') return true;
    }
    var st = normStatus(o.status);
    if (st === 'PAID') return true;
    if (o.paidAt || (o.payment && (o.payment.paidAt || o.payment.tx || o.payment.reference))) return true;
    return false;
  }

  // ===== Shims DB =====
  function subscribeKitchen(cb){
    if (typeof DB.subscribeKitchenOrders==='function') return DB.subscribeKitchenOrders(cb);
    if (typeof DB.subscribeOrders==='function')        return DB.subscribeOrders(cb);
    if (typeof DB.onOrdersSnapshot==='function')       return DB.onOrdersSnapshot(cb);
    if (typeof DB.subscribeActiveOrders==='function')  return DB.subscribeActiveOrders(cb);
    return function(){};
  }
  function setStatus(id, status, opts){
    if (typeof DB.setOrderStatus==='function') return DB.setOrderStatus(id, status, {}, opts);
    if (typeof DB.setStatus==='function')      return DB.setStatus(id, status, opts);
    return Promise.resolve();
  }
  function updateOrder(id, patch, opts){
    if (typeof DB.updateOrder==='function') return DB.updateOrder(id, patch, opts);
    if (typeof DB.upsertOrder==='function') return DB.upsertOrder(Object.assign({id:id}, patch), opts);
    return Promise.resolve();
  }
  function archiveDelivered(id, finalStatus, opts){
    if (typeof DB.archiveDelivered==='function') return DB.archiveDelivered(id, opts);
    return setStatus(id, finalStatus||Status.DONE, opts);
  }
  function applyInventoryForOrder(order, opts){
    if (typeof DB.applyInventoryForOrder==='function') return DB.applyInventoryForOrder(order, opts||{});
    return Promise.resolve();
  }

  // ===== Totales =====
  function calcSubtotal(o){
    var items = Object.prototype.toString.call(o.items)==='[object Array]' ? o.items : [];
    var s=0; for (var i=0;i<items.length;i++){
      var it=items[i];
      var line = (typeof it.lineTotal==='number') ? Number(it.lineTotal||0) : (Number(it.unitPrice||0) * Number(it.qty||1));
      s+=line;
    }
    return s;
  }
  function calcTotal(o){
    var sub = (typeof o.subtotal==='number') ? Number(o.subtotal||0) : calcSubtotal(o||{});
    return sub + Number(o.tip||0);
  }

  // ===== Extras: helpers de visualización =====
  function getPhone(o){
    var p = (o && o.phone) ||
            (o && o.meta && o.meta.phone) ||
            (o && o.customer && o.customer.phone) ||
            (o && o.orderMeta && o.orderMeta.phone) ||
            (o && o.customerPhone);
    return String(p||'').trim();
  }
  function rewardsSummaryHtml(o){
    var rw = o && o.rewards || {};
    var parts = [];
    if (rw && rw.type === 'discount' && Number(rw.discount||0) > 0){
      parts.push('<span class="k-badge ok">🎁 Combo minis: -$' + Number(rw.discount||0).toFixed(0) + '</span>');
    }
    if (rw && rw.type === 'miniDog'){
      parts.push('<span class="k-badge">🌭 Mini Dog (cortesía)</span>');
    }
    if (!parts.length) return '';
    return '<div style="margin-top:6px">' + parts.join(' ') + '</div>';
  }
  function sideMetaLine(it){
    var m = (it && it.meta) || {};
    if (!m || (!m.grams && !m.seasoningId && !m.sauce)) return '';
    var txt = 'PAPAS META: ' +
      (m.grams ? (m.grams + 'g') : '') +
      (m.seasoningId ? (' · ' + m.seasoningId + (m.seasoningGrams ? (' ('+m.seasoningGrams+'g)') : '')) : '') +
      (m.sauce ? (' · ' + m.sauce) : '');
    return '<div class="muted small">' + escapeHtml(txt) + '</div>';
  }
  function buildTrackUrl(o){
    var base = './track.html';
    var q = [];
    if (o && o.id) q.push('oid=' + encodeURIComponent(String(o.id)));
    var p = getPhone(o);
    if (p) q.push('phone=' + encodeURIComponent(p));
    q.push('autostart=1');
    return base + (q.length?'?'+q.join('&'):'');
  }

  // ===== Render =====
  function setCol(id, arr){
    var el = document.getElementById(id); if (!el) return;
    if (!arr || !arr.length){ el.innerHTML='<div class="empty">—</div>'; return; }
    var html=''; for (var i=0;i<arr.length;i++) html += renderCard(arr[i]);
    el.innerHTML = html;
  }

  // Purgado extra por si algo se coló visualmente
  function purgeGhostCards(){
    try{
      var cards = document.querySelectorAll('article.k-card');
      for (var i=0;i<cards.length;i++){
        var txt = (cards[i].innerText || '').toLowerCase();
        if (txt.indexOf('total: $0')>=0 && (txt.indexOf('pagado')>=0 || txt.indexOf('paid')>=0)){
          cards[i].parentNode && cards[i].parentNode.removeChild(cards[i]);
        }
      }
    }catch(_){}
  }

  function render(list){
    var cleaned = [];
    list = Array.isArray(list) ? list : [];

    for (var i=0;i<list.length;i++){
      var o = list[i] || {};
      var s = normStatus(o.status || (o.timestamps && o.timestamps.status));
      var paid = isPaid(o);
      var total = calcTotal(o);
      var hasItems = Array.isArray(o.items) && o.items.length > 0;

      // Pago -> fuera de activas; si además está entregada/PAID, archiva
      if (paid){
        if ((s === Status.DELIVERED || s === 'PAID') && !AUTO_ARCH[o.id]) {
          AUTO_ARCH[o.id] = 1;
          archiveDelivered(o.id, Status.DONE, {}).catch(function(){});
        }
        continue;
      }

      // “Fantasmas”: total ≤ 0 o sin items -> fuera
      if (total <= 0 || !hasItems) continue;

      // Fuera DONE/CANCELLED
      if (s === Status.DONE || s === Status.CANCELLED) continue;

      cleaned.push(o);
    }

    // Agrupar por estado
    var by = {};
    for (var j=0;j<cleaned.length;j++){
      var oo = cleaned[j];
      var sj = normStatus(oo.status);
      if (!by[sj]) by[sj] = [];
      by[sj].push(oo);
    }

    // Pintar columnas
    setCol('col-pending',  by[Status.PENDING]     || []);
    setCol('col-progress', by[Status.IN_PROGRESS] || []);
    setCol('col-ready',    by[Status.READY]       || []);

    // "Por cobrar": entregadas y NO pagadas (las pagadas ya se filtraron)
    var bill = by[Status.DELIVERED] || [];
    setCol('col-bill', bill);

    // Defensa visual final
    setTimeout(purgeGhostCards, 0);
  }

  function renderCard(o){
    o=o||{};
    var items = (o.items&&o.items.length) ? o.items : (o.item ? [{
      id:o.item.id, name:o.item.name, qty:o.qty||1, unitPrice:o.item.price||0,
      baseIngredients:o.baseIngredients||[], salsaDefault:o.salsaDefault||null,
      salsaCambiada:o.salsaCambiada||null, extras:o.extras||{}, notes:o.notes||'',
      lineTotal: (o.item&&o.item.price||0) * (o.qty||1),
      type: o.item.type || null,
      meta: o.meta || {}
    }] : []);

    var meta='—';
    if (o.orderType==='dinein') meta='Mesa: <b>'+escapeHtml(o.table||'?')+'</b>';
    else if (o.orderType==='pickup') meta='pickup';
    else if (o.orderType) meta = escapeHtml(o.orderType);

    var total = calcTotal(o);

    var phone = getPhone(o);
    var phoneTxt = phone ? ' · Tel: <b>'+escapeHtml(phone)+'</b>' : '';
    var trackUrl = buildTrackUrl(o);
    var trackLink = '<a href="'+trackUrl+'" target="_blank" rel="noopener" class="muted small">Ver en Track</a>';

    var tCreated = toMs(o.createdAt || (o.timestamps&&o.timestamps.createdAt));
    var tStarted = toMs(o.startedAt || (o.timestamps&&o.timestamps.startedAt));
    var tReady   = toMs(o.readyAt   || (o.timestamps&&o.timestamps.readyAt));
    var tNow     = Date.now();
    var totalRunMs   = (tReady || tNow) - (tCreated || tNow);
    var inKitchenMs  = (tReady || tNow) - (tStarted || tNow);

    var timerHtml = '<div class="muted small mono" style="margin-top:6px">⏱️ Total: <b>'+fmtMMSS(totalRunMs)+'</b>' + (tStarted ? ' · 👩‍🍳 En cocina: <b>'+fmtMMSS(inKitchenMs)+'</b>' : '') + '</div>';

    var itemsHtml='';
    for (var i=0;i<items.length;i++){
      var it=items[i]||{};
      var name = String(it.name || 'Producto');

      var ingr=''; var bi=it.baseIngredients||[];
      for (var j=0;j<bi.length;j++){ ingr += '<div class="k-badge">'+escapeHtml(bi[j])+'</div>'; }

      var extrasBadges='';
      var sx = (it.extras&&it.extras.sauces)||[];
      for (j=0;j<sx.length;j++){ extrasBadges += '<div class="k-badge">Aderezo: '+escapeHtml(sx[j])+'</div>'; }
      var ix = (it.extras&&it.extras.ingredients)||[];
      for (j=0;j<ix.length;j++){ extrasBadges += '<div class="k-badge">Extra: '+escapeHtml(ix[j])+'</div>'; }
      if (it.extras && it.extras.dlcCarne) extrasBadges += '<div class="k-badge">DLC carne 85g</div>';
      if (it.extras && it.extras.surpriseSauce) extrasBadges += '<div class="k-badge">Sorpresa: '+escapeHtml(it.extras.surpriseSauce)+'</div>';

      var salsaInfo = it.salsaCambiada ? ('Salsa: <b>'+escapeHtml(it.salsaCambiada)+'</b> (cambio)') : (it.salsaDefault ? ('Salsa: '+escapeHtml(it.salsaDefault)) : '');

      var typeBadge = '';
      var t = (it.type || '').toLowerCase();
      if (t === 'drink') typeBadge = '<span class="k-badge">🥤 Bebida</span>';
      else if (t === 'side') typeBadge = '<span class="k-badge">🍟 Side</span>';
      else if (it.mini) typeBadge = '<span class="k-badge">Mini</span>';

      var sideMeta = (t==='side') ? sideMetaLine(it) : '';

      itemsHtml += ''+
        '<div class="order-item">'+
          '<h4>'+escapeHtml(name)+' · x'+(it.qty||1)+' '+typeBadge+'</h4>'+
          (salsaInfo?('<div class="muted small">'+salsaInfo+'</div>'):'')+
          (it.notes?('<div class="muted small">Notas: '+escapeHtml(it.notes)+'</div>'):'')+
          sideMeta+
          '<div class="k-badges" style="margin-top:6px">'+ingr+extrasBadges+'</div>'+
        '</div>';
    }

    var hh = o.hh || {};
    var hhSummary = (hh.enabled && Number(hh.totalDiscount||0)>0)
      ? '<span class="k-badge">HH -'+Number(hh.discountPercent||0)+'% · ahorro '+money(hh.totalDiscount)+'</span>' : '';
    var rewardsHtml = rewardsSummaryHtml(o);

    var st = normStatus(o.status);
    var paidFlag = isPaid(o);
    var canShowTake = (st===Status.PENDING) && !LOCALLY_TAKEN[o.id];
    var actions = ''
      + (canShowTake ? '<button class="btn" data-a="take">Tomar</button>' : '')
      + (st===Status.IN_PROGRESS ? '<button class="btn ok" data-a="ready">Listo</button>' : '')
      + (st===Status.READY ? '<button class="btn ok" data-a="deliver">Entregar</button>' : '')
      + ((st===Status.DELIVERED && !paidFlag) ? '<button class="btn" data-a="charge">Cobrar</button>' : '')
      + ((st===Status.PENDING || st===Status.IN_PROGRESS || (st===Status.DELIVERED && !paidFlag)) ? '<button class="btn ghost" data-a="edit">Editar</button>' : '')
      + ((st===Status.PENDING || st===Status.IN_PROGRESS || (st===Status.DELIVERED && !paidFlag)) ? '<button class="btn warn" data-a="cancel">Eliminar</button>' : '');

    return ''+
      '<article class="k-card" data-id="'+o.id+'">'+
        '<div class="muted small">Cliente: <b>'+escapeHtml(o.customer||'-')+'</b>'+phoneTxt+' · '+escapeHtml(meta)+' · '+trackLink+'</div>'+
        '<div class="muted small mono" style="margin-top:4px">Total por cobrar: <b>'+money(total)+'</b> '+(paidFlag ? '· <span class="k-badge ok">Pagado</span>' : '')+' '+hhSummary+'</div>'+
        rewardsHtml+
        timerHtml+
        itemsHtml+
        (o.notes ? '<div class="muted small"><b>Notas generales:</b> '+escapeHtml(o.notes)+'</div>' : '')+
        '<div class="k-actions" style="margin-top:8px">'+actions+'</div>'+
      '</article>';
  }

  // ===== Stream =====
  var __lock=false;
  var unsub = subscribeKitchen(function(orders){
    if (__lock) return; __lock=true;
    try{
      var raw = Array.isArray(orders)?orders.slice(0):[];
      raw = raw.filter(function(o){
        var s = normStatus(o && o.status);
        return s !== Status.DONE && s !== Status.CANCELLED && s !== 'PAID';
      });
      CURRENT_LIST = raw;
      window.CURRENT_LIST = CURRENT_LIST; // diagnóstico
      render(CURRENT_LIST);
    } finally { setTimeout(function(){ __lock=false; },0); }
  });

  // ===== Acciones =====
  document.addEventListener('click', function(e){
    var btn = e.target.closest && e.target.closest('button[data-a]');
    if (!btn) return;
    var card = btn.closest && btn.closest('[data-id]'); if (!card) return;
    var id = card.getAttribute('data-id'); var a = btn.getAttribute('data-a');
    var OPTS = {};
    btn.disabled = true;

    function patchLocal(id, patch){
      var found=false;
      for (var i=0;i<CURRENT_LIST.length;i++){
        if (CURRENT_LIST[i].id===id){ for (var k in patch){ CURRENT_LIST[i][k]=patch[k]; } found=true; break; }
      }
      if (!found) CURRENT_LIST.push(Object.assign({id:id}, patch));
    }
    function re(){ render(CURRENT_LIST); }

    try{
      if (a==='take'){
        LOCALLY_TAKEN[id]=1; btn.textContent='Tomando…';
        var order = null; for (var i=0;i<CURRENT_LIST.length;i++){ if(CURRENT_LIST[i].id===id){ order=CURRENT_LIST[i]; break; } }
        if(order){ applyInventoryForOrder(Object.assign({id:id}, order), OPTS); }
        patchLocal(id, { status:Status.IN_PROGRESS, startedAt:now(), updatedAt:now() }); re();
        setStatus(id, Status.IN_PROGRESS, OPTS).then(function(){
          return updateOrder(id, { startedAt:now(), updatedAt:now() }, OPTS);
        }).then(function(){ beep(); toast('En preparación'); })
          .catch(function(){ toast('Error'); LOCALLY_TAKEN[id]=0; }).then(function(){ btn.disabled=false; });
        return;
      }
      if (a==='ready'){
        patchLocal(id, { status:Status.READY, readyAt:now(), updatedAt:now() }); re();
        setStatus(id, Status.READY, OPTS).then(function(){
          return updateOrder(id, { readyAt:now(), updatedAt:now() }, OPTS);
        }).then(function(){ beep(); toast('Listo 🛎️'); })
          .catch(function(){ toast('Error'); }).then(function(){ btn.disabled=false; });
        return;
      }
      if (a==='deliver'){
        patchLocal(id, { status:Status.DELIVERED, deliveredAt:now(), updatedAt:now() }); re();
        setStatus(id, Status.DELIVERED, OPTS).then(function(){
          return updateOrder(id, { deliveredAt:now(), updatedAt:now() }, OPTS);
        }).then(function(){ beep(); toast('Entregado ✔️ · por cobrar'); })
          .catch(function(){ toast('Error'); }).then(function(){ btn.disabled=false; });
        return;
      }
      if (a==='charge'){
        var ord=null; for (var j=0;j<CURRENT_LIST.length;j++){ if(CURRENT_LIST[j].id===id){ ord=CURRENT_LIST[j]; break; } }
        if(!ord){ btn.disabled=false; return; }
        var total=calcTotal(ord);
        var method = prompt('Cobrar '+money(total)+'\nMétodo (efectivo / tarjeta / transferencia):','efectivo');
        if (method===null){ btn.disabled=false; return; }
        var payMethod = String(method||'efectivo').toLowerCase();
        patchLocal(id, { paid:true, paidAt:now(), payMethod:payMethod, totalCharged:Number(total), updatedAt:now() }); re();
        updateOrder(id, { paid:true, paidAt:now(), payMethod:payMethod, totalCharged:Number(total), updatedAt:now() }, OPTS)
          .then(function(){ return archiveDelivered(id, Status.DONE, OPTS); })
          .then(function(){ beep(); toast('Cobro registrado'); var c=card; c.parentNode && c.parentNode.removeChild(c); })
          .catch(function(){ toast('Error'); })
          .then(function(){ btn.disabled=false; });
        return;
      }
      if (a==='edit'){
        var ord2=null; for (var k=0;k<CURRENT_LIST.length;k++){ if(CURRENT_LIST[k].id===id){ ord2=CURRENT_LIST[k]; break; } }
        if (!ord2){ btn.disabled=false; return; }
        var notes = prompt('Editar notas generales para cocina:', ord2.notes||'');
        if (notes!==null){
          patchLocal(id, { notes:notes, updatedAt:now() }); re();
          updateOrder(id, { notes:notes, updatedAt:now() }, OPTS).then(function(){ toast('Notas actualizadas'); })
            .catch(function(){ toast('Error'); }).then(function(){ btn.disabled=false; });
        } else { btn.disabled=false; }
        return;
      }
      if (a==='cancel'){
        var ok = confirm('¿Eliminar este pedido? Pasará a CANCELLED y se archivará.');
        if (!ok){ btn.disabled=false; return; }
        var reason = prompt('Motivo de cancelación (obligatorio):','');
        if (reason===null){ btn.disabled=false; return; }
        reason = String(reason).trim(); if (!reason){ alert('Por favor escribe un motivo.'); btn.disabled=false; return; }
        patchLocal(id, { status:Status.CANCELLED, cancelReason:reason, cancelledAt:now(), updatedAt:now() }); re();
        updateOrder(id, { status:Status.CANCELLED, cancelReason:reason, cancelledAt:now(), cancelledBy:'kitchen', updatedAt:now() }, OPTS)
          .then(function(){ return archiveDelivered(id, Status.DONE, OPTS); })
          .then(function(){ beep(); toast('Pedido eliminado'); var c2=card; c2.parentNode && c2.parentNode.removeChild(c2); })
          .catch(function(){ toast('Error'); })
          .then(function(){ btn.disabled=false; });
        return;
      }
    } catch(err){ console.error(err); toast('Error'); btn.disabled=false; }
  });

  // ===== Timers suaves =====
  setInterval(function(){ if (CURRENT_LIST && CURRENT_LIST.length) render(CURRENT_LIST); }, 15000);

  // ===== Limpieza =====
  window.addEventListener('beforeunload', function(){ try{unsub && unsub();}catch(_){ } });

})();
