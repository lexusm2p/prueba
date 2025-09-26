/* app.legacy.js — Admin compacto ES5 */

(function(){
  // ====== NUEVO: Helpers DOM y polyfills mínimos ======
  var $ = function(sel, root){ return (root||document).querySelector(sel); };
  var $$ = function(sel, root){
    var list = (root||document).querySelectorAll(sel);
    return Array.prototype.slice.call(list);
  };

  // Polyfill matches/closest para legacy
  (function(){
    var EP = window.Element && Element.prototype;
    if (!EP) return;
    if (!EP.matches) {
      EP.matches = EP.msMatchesSelector || EP.webkitMatchesSelector || function(s){
        var m = (this.document || this.ownerDocument).querySelectorAll(s);
        var i = 0; while (m[i] && m[i] !== this) i++; return !!m[i];
      };
    }
    if (!EP.closest) {
      EP.closest = function(s){
        var el = this;
        while (el && el.nodeType === 1) { if (el.matches(s)) return el; el = el.parentElement || el.parentNode; }
        return null;
      };
    }
  })();

  // ====== NUEVO: extend (reemplazo de Object.assign) ======
  function extend(target){
    target = target || {};
    for (var i=1;i<arguments.length;i++){
      var src = arguments[i]; if (!src) continue;
      for (var k in src) if (Object.prototype.hasOwnProperty.call(src,k)) target[k]=src[k];
    }
    return target;
  }

  // ====== Imports “globales” ======
  var DB = window.DB || {};
  var notify = window.Notify || {};
  var toast = (window.toast || notify.toast || function(s){ try{ console.log('toast:',s);}catch(e){} });
  var beep = (window.beep || function(){});

  // ====== Selectores ======
  var tabs = $('#admTabs');
  var panels = {
    reportes:   $('#panel-reportes'),
    hist:       $('#panel-hist'),
    cobros:     $('#panel-cobros'),
    compras:    $('#panel-compras'),
    inventario: $('#panel-inventario'),
    proveedores:$('#panel-proveedores'),
    productos:  $('#panel-productos'),
    temas:      $('#panel-temas'),
    happy:      $('#panel-happy'),
    recetas:    $('#panel-recetas'),
    articulos:  $('#panel-articulos')
  };

  // ====== Eventos de tabs ======
  if (tabs){
    tabs.addEventListener('click', function(e){
      var btn = e.target.closest ? e.target.closest('.tab[data-tab]') : null;
      if (!btn) return;
      var name = btn.getAttribute('data-tab');
      $$('.tabs-admin .tab').forEach(function(b){
        var on = b.getAttribute('data-tab') === name;
        if (on) b.classList.add('is-active'); else b.classList.remove('is-active');
        b.setAttribute('aria-selected', String(on));
      });
      for (var k in panels){
        if (!panels[k]) continue;
        if (k===name) panels[k].classList.add('active'); else panels[k].classList.remove('active');
      }
    });
  }

  // ====== Utils ======
  function money(n){ return '$' + Number(n||0).toFixed(0); }
  function toMs(t){
    if (!t) return 0;
    if (t && typeof t.toMillis === 'function') return t.toMillis();
    if (t && typeof t.seconds !== 'undefined') return (t.seconds*1000) + Math.floor((t.nanoseconds||0)/1e6);
    var d = new Date(t); var ms = d.getTime(); return isFinite(ms) ? ms : 0; // CAMBIO: isFinite
  }
  function fmtDate(ms){
    var d = new Date(ms||Date.now());
    try { return d.toLocaleString([], { dateStyle:'short', timeStyle:'short' }); }
    catch(e){ return d.toLocaleString(); }
  }
  function fillTable(tbody, rows){
    if (!tbody) return;
    if (!rows || !rows.length){ tbody.innerHTML = '<tr><td colspan="9">—</td></tr>'; return; }
    var html = '';
    for (var i=0;i<rows.length;i++){
      var tr = rows[i], tds='';
      for (var j=0;j<tr.length;j++){ tds += '<td>'+ tr[j] +'</td>'; }
      html += '<tr>'+ tds +'</tr>';
    }
    tbody.innerHTML = html;
  }
  function calcTotal(o){
    o = o||{};
    var sub;
    if (typeof o.subtotal === 'number') sub = Number(o.subtotal||0);
    else if (Object.prototype.toString.call(o.items)==='[object Array]'){
      sub = 0;
      for (var i=0;i<o.items.length;i++){
        var it=o.items[i];
        var line = (typeof it.lineTotal==='number') ? Number(it.lineTotal||0) : (Number(it.unitPrice||0) * Number(it.qty||1));
        sub += line;
      }
    } else {
      sub = Number((o.item&&o.item.price)||0) * Number(o.qty||1);
    }
    var tip = Number(o.tip||0);
    return sub + tip;
  }

  // ====== SHIMS simples ======
  var dbShim = {
    getOrdersRange: function(opts){
      if (typeof DB.getOrdersRange === 'function') return DB.getOrdersRange(opts);
      if (typeof DB.listOrdersRange === 'function') return DB.listOrdersRange(opts);
      return new Promise(function(res){ res([]); });
    },
    adjustInventory: function(p){
      if (typeof DB.adjustInventory === 'function') return DB.adjustInventory(p);
      if (typeof DB.applyPurchaseToInventory === 'function') return DB.applyPurchaseToInventory({ itemId:p.itemId, name:p.name, qty:p.deltaQty, unit:p.unit, unitCost:p.unitCost });
      if (typeof DB.upsertInventoryItem === 'function') {
        // Fallback: sumar existencia y recalcular costo
        return Promise.resolve().then(function(){
          if (typeof DB.getInventoryItem !== 'function') return null;
          return DB.getInventoryItem(p.itemId || p.name);
        }).then(function(current){
          var prevQty  = Number((current&&current.currentStock)||0);
          var prevCost = Number((current&&current.costAvg)||0);
          var newQty   = prevQty + Number(p.deltaQty||0);
          var costAvg  = newQty>0 ? ((prevQty*prevCost + Number(p.deltaQty||0)*Number(p.unitCost||0))/newQty) : prevCost;
          return DB.upsertInventoryItem(extend({}, current||{}, {
            id:(current&&current.id)||(p.itemId||p.name),
            name:(p.name)||((current&&current.name)||(p.itemId)||'Item'),
            unit:(p.unit)||((current&&current.unit)||'u'),
            currentStock:newQty,
            costAvg:costAvg
          })); // CAMBIO: extend en lugar de Object.assign
        });
      }
      console.warn('[legacy] no adjustInventory'); return Promise.resolve();
    },
    consumeForOrder: function(order, opts){
      if (typeof DB.consumeInventoryForOrder === 'function') return DB.consumeInventoryForOrder(order, opts||{});
      if (typeof DB.applyInventoryForOrder === 'function')  return DB.applyInventoryForOrder(order, opts||{});
      return Promise.resolve();
    },
    setInitialStock: function(p){
      if (typeof DB.setInitialStock === 'function') return DB.setInitialStock(p);
      if (typeof DB.upsertInventoryItem === 'function') return DB.upsertInventoryItem({ id:p.name, name:p.name, unit:p.unit||'u', currentStock:Number(p.qty||0), costAvg:0 });
      return Promise.resolve();
    }
  };

  /* ================= REPORTES ================= */
  var btnRepGen = $('#btnRepGen');
  if (btnRepGen){
    btnRepGen.addEventListener('click', function(){
      try{
        var from = ($('#repFrom') && $('#repFrom').valueAsDate) || new Date(new Date().setHours(0,0,0,0));
        var to   = ($('#repTo')   && $('#repTo').valueAsDate)   || new Date();
        var type = ($('#repType') && $('#repType').value) || 'all';
        var includeArchive = ( ($('#repHist') && $('#repHist').value)||'Sí' ) === 'Sí';

        dbShim.getOrdersRange({ from:from, to:to, includeArchive:includeArchive, orderType:type }).then(function(rows){
          var ordersCount = rows.length;
          var revenue = 0, units = 0;
          var i, o;
          for(i=0;i<rows.length;i++){
            o = rows[i]; revenue += calcTotal(o);
            if (o.items && o.items.length){
              for(var k=0;k<o.items.length;k++) units += Number(o.items[k].qty||1);
            } else { units += Number(o.qty||1); }
          }
          $('#kpiOrders') && ($('#kpiOrders').textContent = String(ordersCount));
          $('#kpiUnits')  && ($('#kpiUnits').textContent  = String(units));
          $('#kpiRevenue')&& ($('#kpiRevenue').textContent= money(revenue));
          $('#kpiAvg')    && ($('#kpiAvg').textContent    = money(ordersCount ? (revenue/ordersCount) : 0));

          // Top/Low
          var acc = {}; // name -> {units,revenue}
          for(i=0;i<rows.length;i++){
            o = rows[i];
            var items = (o.items&&o.items.length)?o.items:(o.item?[{name:o.item.name, unitPrice:o.item.price, qty:o.qty||1}]:[]);
            for (var j=0;j<items.length;j++){
              var it = items[j]; var key = String(it.name||'Producto');
              if (!acc[key]) acc[key] = { name:key, units:0, revenue:0 };
              var line = (typeof it.lineTotal==='number')?Number(it.lineTotal||0):(Number(it.unitPrice||0)*Number(it.qty||1));
              acc[key].units += Number(it.qty||1); acc[key].revenue += line;
            }
          }
          var arr=[], k; for(k in acc) arr.push(acc[k]);
          arr.sort(function(a,b){ return (b.units-a.units) || (b.revenue-a.revenue); });
          fillTable($('#tblTop tbody'),  arr.slice(0,10).map(function(r){ return [r.name, r.units, money(r.revenue)]; }));
          fillTable($('#tblLow tbody'),  arr.slice(Math.max(0,arr.length-10)).map(function(r){ return [r.name, r.units, money(r.revenue)]; }));

          // Por hora
          var perHour={}; 
          for(i=0;i<rows.length;i++){
            o=rows[i]; var ms=toMs(o.createdAt||(o.timestamps&&o.timestamps.createdAt)); var h=new Date(ms).getHours();
            var k2=(h<10?'0':'')+h+':00';
            if(!perHour[k2]) perHour[k2]={k:k2,orders:0,rev:0};
            perHour[k2].orders++; perHour[k2].rev += calcTotal(o);
          }
          var arrH=[]; for(k in perHour) arrH.push(perHour[k]); arrH.sort(function(a,b){ return a.k<b.k?-1:a.k>b.k?1:0; });
          fillTable($('#tblHours tbody'), arrH.map(function(r){ return [r.k, r.orders, money(r.rev)]; }));

          toast('Reporte generado');
        });
      }catch(e){ console.error(e); toast('Error al generar reporte'); }
    });
  }

  /* ================= HISTORIAL ================= */
  var rowsCacheHist = [];
  function loadHist(){
    var from = ($('#repFrom') && $('#repFrom').valueAsDate) || new Date(new Date().setHours(0,0,0,0));
    var to   = ($('#repTo')   && $('#repTo').valueAsDate)   || new Date();
    var type = ($('#histType') && $('#histType').value) || 'all';
    var q    = ( ($('#histSearch') && $('#histSearch').value) || '' ).toLowerCase();
    var limitN = Number(($('#histLimit') && $('#histLimit').value) || 50);

    dbShim.getOrdersRange({ from:from, to:to, includeArchive:true, orderType:type }).then(function(all){
      var rows = all;
      if (q){
        rows = rows.filter(function(o){
          var base = [o.id, o.customer, (o.orderMeta&&o.orderMeta.phone), o.phone].map(function(x){ return String(x||'').toLowerCase(); }).join(' ');
          return base.indexOf(q) >= 0;
        });
      }
      rows = rows.slice(Math.max(0, rows.length - limitN));
      rowsCacheHist = rows;

      var tb = $('#tblHist tbody');
      if (!tb){ toast('Sin tabla Hist'); return; }
      if (!rows.length){ tb.innerHTML='<tr><td colspan="7">—</td></tr>'; toast('Historial cargado'); return; }

      var html='', i;
      for (i=0;i<rows.length;i++){
        var o=rows[i];
        var itemsTxt = (o.items && o.items.length)
          ? o.items.map(function(it){ return (it.qty||1)+'× '+(it.name||'Item'); }).join(', ')
          : (o.item ? ((o.qty||1)+'× '+(o.item.name||'Item')) : '—');
        var st = String(o.status||'').toUpperCase();
        html += '<tr>'+
          '<td>'+ fmtDate(toMs(o.createdAt||(o.timestamps&&o.timestamps.createdAt))) +'</td>'+
          '<td class="break">'+ (o.customer||'-') +'</td>'+
          '<td>'+ ((o.orderMeta&&o.orderMeta.type) || o.orderType || '-') +'</td>'+
          '<td class="break">'+ itemsTxt +'</td>'+
          '<td class="right">'+ money(calcTotal(o)) +'</td>'+
          '<td>'+ st +'</td>'+
          '<td class="right">'+
            '<button class="btn small ghost" data-a="open" data-id="'+o.id+'">Ver</button> '+
            '<button class="btn small" data-a="consume" data-id="'+o.id+'">Consumo</button>'+
          '</td>'+
        '</tr>';
      }
      tb.innerHTML = html;

      tb.onclick = function(e){
        var t = e.target || e.srcElement;
        var open = t.closest ? t.closest('button[data-a="open"]') : null;
        var consume = t.closest ? t.closest('button[data-a="consume"]') : null;
        if (open){
          var id = open.getAttribute('data-id');
          window.open('../track/?id='+encodeURIComponent(id),'_blank'); return;
        }
        if (consume){
          var id2 = consume.getAttribute('data-id');
          consume.disabled = true;
          var order = null;
          for (var z=0; z<rowsCacheHist.length; z++){ if (rowsCacheHist[z].id===id2){ order=rowsCacheHist[z]; break; } }
          if (!order){ toast('Pedido no encontrado'); consume.disabled=false; return; }
          dbShim.consumeForOrder(extend({id:order.id}, order), {replay:true, source:'admin'}) // CAMBIO: extend
            .then(function(){ toast('Consumo reaplicado'); })
            .catch(function(){ toast('Error al consumir'); })
            .then(function(){ consume.disabled=false; });
        }
      };

      toast('Historial cargado');
    });
  }
  var btnHist = $('#btnHistLoad'); if (btnHist) btnHist.addEventListener('click', loadHist);
  var btnCSV  = $('#btnHistCSV');  if (btnCSV) btnCSV.addEventListener('click', function(){
    var trs = $$('#tblHist tbody tr');
    var out = ['Fecha,Cliente,Tipo,Artículos,Total,Estado'];
    for (var i=0;i<trs.length;i++){
      var tds = trs[i].children; var line = [];
      for (var j=0;j<6;j++){ line.push('"'+ String(tds[j].textContent||'').replace(/"/g,'""') +'"'); }
      out.push(line.join(','));
    }
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([out.join('\n')], {type:'text/csv'}));
    a.download = 'historial_'+Date.now()+'.csv'; document.body.appendChild(a); a.click(); a.remove();
  });

  /* ================= COBROS ================= */
  var unsubCob = null;
  function startCobros(){
    if (!DB.subscribeActiveOrders) return;
    if (unsubCob) try{unsubCob();}catch(e){}
    unsubCob = DB.subscribeActiveOrders(function(list){
      list = list||[];
      // Por cobrar
      var pend = list.filter(function(o){ return String(o.status||'').toUpperCase()==='DELIVERED' && !o.paid; });
      fillTable($('#tblPorCobrar tbody'), pend.map(function(o){
        return [ fmtDate(toMs(o.createdAt|| (o.timestamps&&o.timestamps.createdAt))),
                 (o.customer||'-'),
                 ((o.orderMeta&&o.orderMeta.type) || o.orderType || '-'),
                 '<div class="right">'+money(calcTotal(o))+'</div>',
                 ((o.orderMeta&&o.orderMeta.payMethodPref) || '-'),
                 '<div class="right"><button class="btn small" data-a="charge" data-id="'+o.id+'">Cobrar</button></div>' ];
      }));

      // Historial cobrado (en vivos)
      var hist = list.filter(function(o){ return !!o.paid; });
      var total=0, by={efectivo:0,tarjeta:0,transferencia:0,otro:0};
      for (var i=0;i<hist.length;i++){
        var o=hist[i], t=Number(o.totalCharged||calcTotal(o)); total+=t;
        var m = String(o.payMethod||'otro').toLowerCase();
        if (by[m]==null) by.otro += t; else by[m]+=t;
      }
      $('#kpiCobrosCount') && ($('#kpiCobrosCount').textContent = String(hist.length));
      $('#kpiCobrosTotal') && ($('#kpiCobrosTotal').textContent = money(total));
      $('#kpiCobrosEfe')   && ($('#kpiCobrosEfe').textContent   = money(by.efectivo));
      $('#kpiCobrosTar')   && ($('#kpiCobrosTar').textContent   = money(by.tarjeta));
      $('#kpiCobrosTrans') && ($('#kpiCobrosTrans').textContent = money(by.transferencia));

      fillTable($('#tblCobrosHist tbody'), hist.map(function(o){
        return [ fmtDate(toMs(o.paidAt||o.updatedAt||Date.now())),
                 (o.customer||'-'),
                 ((o.orderMeta&&o.orderMeta.type) || o.orderType || '-'),
                 '<div class="right">'+money(o.totalCharged||calcTotal(o))+'</div>',
                 (o.payMethod||'-') ];
      }));
    });

    var tb = $('#tblPorCobrar tbody');
    if (tb){
      tb.addEventListener('click', function(e){
        var btn = e.target.closest ? e.target.closest('button[data-a="charge"]') : null;
        if (!btn) return;
        var id = btn.getAttribute('data-id'); btn.disabled = true;
        try{
          var method = prompt('Método (efectivo/tarjeta/transferencia):','efectivo');
          if (method==null){ btn.disabled=false; return; }
          DB.updateOrder(id, { paid:true, paidAt:new Date(), payMethod:method, totalCharged:null }).then(function(){
            var setS = DB.setOrderStatus || DB.setStatus;
            return setS ? setS(id, 'DONE', {}) : null;
          }).then(function(){ toast('Cobro registrado'); })
            .catch(function(){ toast('Error al cobrar'); })
            .then(function(){ btn.disabled=false; });
        }catch(err){ console.error(err); toast('Error al cobrar'); btn.disabled=false; }
      });
    }
  }
  var btnCobRef = $('#btnCobrosRefresh'); if (btnCobRef) btnCobRef.addEventListener('click', startCobros); startCobros();

  /* ================= COMPRAS ================= */
  var btnAddPurchase = $('#btnAddPurchase');
  if (btnAddPurchase){
    btnAddPurchase.addEventListener('click', function(){
      try{
        var name = ($('#pName') && $('#pName').value||'').trim();
        var qty  = Number(($('#pQty') && $('#pQty').value)||0);
        var cost = Number(($('#pCost') && $('#pCost').value)||0);
        var vendor = ($('#pVendor') && $('#pVendor').value||'').trim();
        var unit = ($('#pUnit') && $('#pUnit').value||'u').trim();
        if (!name || !(qty>0)){ toast('Completa nombre y cantidad'); return; }

        var unitCost = qty>0 ? (cost/qty) : 0;
        var p1 = Promise.resolve();
        if (typeof DB.recordPurchase === 'function') p1 = DB.recordPurchase({ itemId:name, qty:qty, unitCost:unitCost, vendor:vendor, name:name, totalCost:cost });
        else if (typeof DB.upsertPurchase === 'function') p1 = DB.upsertPurchase({ itemId:name, qty:qty, unitCost:unitCost, vendor:vendor, name:name, totalCost:cost, createdAt:Date.now() });

        p1.then(function(){
          return dbShim.adjustInventory({ itemId:name, name:name, deltaQty:qty, unit:unit, unitCost:unitCost });
        }).then(function(){
          toast('Compra registrada y aplicada a inventario');
          if ($('#pName')) $('#pName').value='';
          if ($('#pQty')) $('#pQty').value='';
          if ($('#pCost')) $('#pCost').value='';
          if ($('#pVendor')) $('#pVendor').value='';
        }).catch(function(){ toast('Error al registrar compra'); });
      }catch(e){ console.error(e); toast('Error al registrar compra'); }
    });
  }

  /* ================= INVENTARIO ================= */
  var INV_CACHE = [];
  function renderInv(){
    var q = ( ($('#invSearch') && $('#invSearch').value)||'' ).toLowerCase();
    var list = INV_CACHE.filter(function(x){
      var n = String(x.name||'').toLowerCase();
      return !q || n.indexOf(q)>=0;
    });
    fillTable($('#tblInv tbody'), list.map(function(it){
      var val = Number(it.currentStock||0)*Number(it.costAvg||0);
      return [ it.name||'-', Number(it.currentStock||0), it.unit||'-', money(it.costAvg||0), money(val) ];
    }));
  }
  var btnInvRefresh = $('#btnInvRefresh'); if (btnInvRefresh) btnInvRefresh.addEventListener('click', renderInv);
  var invSearch = $('#invSearch'); if (invSearch) invSearch.addEventListener('input', renderInv);

  if (typeof DB.subscribeInventory === 'function') {
    DB.subscribeInventory(function(list){ INV_CACHE = list||[]; renderInv(); });
  } else if (typeof DB.listInventory === 'function') {
    DB.listInventory().then(function(list){ INV_CACHE = list||[]; renderInv(); });
  }

  // Stock inicial
  var btnInvInit = $('#btnInvInitSet');
  if (btnInvInit){
    btnInvInit.addEventListener('click', function(){
      var name = ($('#invInitName') && $('#invInitName').value||'').trim();
      var qty  = Number(($('#invInitQty') && $('#invInitQty').value)||0);
      var unit = ($('#invInitUnit') && $('#invInitUnit').value||'u').trim();
      if (!name){ toast('Nombre requerido'); return; }
      dbShim.setInitialStock({ name:name, qty:qty, unit:unit }).then(function(){
        toast('Stock inicial establecido');
        if ($('#invInitName')) $('#invInitName').value='';
        if ($('#invInitQty')) $('#invInitQty').value='';
        if ($('#invInitUnit')) $('#invInitUnit').value='';
      }).catch(function(){ toast('Error al fijar stock inicial'); });
    });
  }

  // Recalcular consumo
  function replayConsumption(from, to){
    dbShim.getOrdersRange({ from:from, to:to, includeArchive:true, orderType:'all' }).then(function(rows){
      var ok = {'IN_PROGRESS':1,'READY':1,'DELIVERED':1,'DONE':1,'PAID':1};
      var batch = rows.filter(function(o){ return ok[String(o.status||'').toUpperCase()]; });
      var n=0, seq = Promise.resolve();
      batch.forEach(function(o){
        seq = seq.then(function(){ n++; return dbShim.consumeForOrder(extend({id:o.id}, o), { replay:true, source:'admin-replay' }); });
      });
      return seq.then(function(){ toast('Consumo recalculado: '+n+' pedidos'); });
    }).catch(function(){ toast('Error al recalcular consumo'); });
  }
  var btnRecalcToday = $('#btnInvRecalcToday'); if (btnRecalcToday) btnRecalcToday.addEventListener('click', function(){
    var from = new Date(new Date().setHours(0,0,0,0)), to=new Date(); replayConsumption(from,to);
  });
  var btnRecalcRange = $('#btnInvRecalcRange'); if (btnRecalcRange) btnRecalcRange.addEventListener('click', function(){
    var from = ($('#repFrom') && $('#repFrom').valueAsDate) || new Date(new Date().setHours(0,0,0,0));
    var to   = ($('#repTo')   && $('#repTo').valueAsDate)   || new Date();
    replayConsumption(from,to);
  });

  /* ================= PROVEEDORES ================= */
  var btnSaveVendor = $('#btnSaveVendor');
  if (btnSaveVendor){
    btnSaveVendor.addEventListener('click', function(){
      try{
        var name = ($('#vName') && $('#vName').value||'').trim();
        var contact = ($('#vContact') && $('#vContact').value||'').trim();
        if (!name){ toast('Completa el nombre'); return; }
        var upsert = DB.upsertSupplier || DB.upsertVendor || DB.saveSupplier;
        if (typeof upsert === 'function') upsert({ name:name, contact:contact, active:true }).then(function(){ toast('Proveedor guardado'); $('#vName').value=''; $('#vContact').value=''; });
      }catch(e){ console.error(e); toast('Error al guardar proveedor'); }
    });
  }
  if (typeof DB.subscribeSuppliers === 'function'){
    DB.subscribeSuppliers(function(list){
      fillTable($('#tblVendors tbody'), (list||[]).map(function(v){ return [v.name||'-', v.contact||'-', v.id||'-']; }));
    });
  }

  /* ================= PRODUCTOS (solo lectura) ================= */
  var btnReloadCatalog = $('#btnReloadCatalog');
  if (btnReloadCatalog){
    btnReloadCatalog.addEventListener('click', function(){
      if (!DB.fetchCatalogWithFallback) return;
      DB.fetchCatalogWithFallback().then(function(cat){
        var count = ['burgers','minis','drinks','sides'].reduce(function(s,k){ var arr = (cat&&cat[k])||[]; return s + (arr.length||0); }, 0);
        toast('Catálogo refrescado ('+count+' items)');
      });
    });
  }
  if (typeof DB.subscribeProducts === 'function'){
    DB.subscribeProducts(function(items){
      fillTable($('#tblProducts tbody'), (items||[]).map(function(p){
        return [ p.name||'-', p.type||'-', money(p.price||0), (p.active?'<span class="k-badge ok">Sí</span>':'<span class="k-badge warn">No</span>'), p.id||'-' ];
      }));
    });
  }

  /* ================= RECETAS (solo lectura + modal) ================= */
  var RECIPES = [];
  if (typeof DB.subscribeRecipes === 'function'){
    DB.subscribeRecipes(function(list){
      RECIPES = list||[];
      fillTable($('#tblRecipes tbody'), RECIPES.map(function(r){
        return [ r.name||'-', (r.baseYieldMl||0)+' ml', r.outputName||'-', ( (r.ingredients&&r.ingredients.length)||0 ), '<button class="btn small ghost" data-a="open" data-id="'+r.id+'">Ver</button>' ];
      }));
    });
  }
  var tblRcp = $('#tblRecipes tbody');
  if (tblRcp){
    tblRcp.addEventListener('click', function(e){
      var btn = e.target.closest ? e.target.closest('button[data-a="open"]') : null; if(!btn) return;
      var id = btn.getAttribute('data-id'); var rec=null; for(var i=0;i<RECIPES.length;i++){ if(RECIPES[i].id===id){ rec=RECIPES[i]; break; } }
      if (!rec) return;
      var modal = $('#rcpModal'), body=$('#rcpBody'), title=$('#rcpTitle');
      if (!modal) return;
      title.textContent = rec.name || 'Receta';
      var ing = (rec.ingredients||[]).map(function(i){ return '<li>'+(i.qty||'')+' '+(i.unit||'')+' — '+(i.name||'')+'</li>'; }).join('');
      body.innerHTML = '<div class="muted small">Rinde base: '+(rec.baseYieldMl||0)+' ml</div><ul>'+ing+'</ul>';
      modal.style.display='grid';
    });
  }
  var rcpClose = $('#rcpClose'); if (rcpClose) rcpClose.addEventListener('click', function(){ var m=$('#rcpModal'); if(m) m.style.display='none'; });

  /* ================= ARTÍCULOS (CRUD) ================= */
  var ART_CACHE = [];
  function renderArt(){
    var q = ( ($('#artSearch') && $('#artSearch').value)||'' ).toLowerCase();
    var rows = ART_CACHE.filter(function(a){
      return !q || String(a.name||'').toLowerCase().indexOf(q)>=0 || String(a.desc||'').toLowerCase().indexOf(q)>=0;
    });
    var tb = $('#tblArticulos tbody'); if (!tb) return;
    if (!rows.length){ tb.innerHTML='<tr><td colspan="4">—</td></tr>'; return; }
    var html=''; for (var i=0;i<rows.length;i++){
      var a=rows[i];
      html += '<tr>'+
        '<td class="break">'+(a.name||'-')+'</td>'+
        '<td>'+money(a.price||0)+'</td>'+
        '<td>'+(a.active?'<span class="badge-active">Sí</span>':'<span class="badge-inactive">No</span>')+'</td>'+
        '<td>'+
          '<button class="btn small ghost" data-a="edit" data-id="'+a.id+'">Editar</button> '+
          '<button class="btn small ghost" data-a="del" data-id="'+a.id+'">Borrar</button>'+
        '</td>'+
      '</tr>';
    }
    tb.innerHTML=html;
  }
  if (typeof DB.subscribeArticles === 'function'){
    DB.subscribeArticles(function(list){ ART_CACHE = list||[]; renderArt(); });
  }
  var artSearch = $('#artSearch'); if (artSearch) artSearch.addEventListener('input', renderArt);
  var btnAddArticulo = $('#btnAddArticulo'); if (btnAddArticulo) btnAddArticulo.addEventListener('click', function(){ openArticleModal({}); });
  var tblArt = $('#tblArticulos tbody'); if (tblArt){
    tblArt.addEventListener('click', function(e){
      var btn = e.target.closest ? e.target.closest('button[data-a]') : null; if(!btn) return;
      var id = btn.getAttribute('data-id');
      var a=null; for (var i=0;i<ART_CACHE.length;i++){ if(ART_CACHE[i].id===id){ a=ART_CACHE[i]; break; } }
      if (btn.getAttribute('data-a')==='edit') openArticleModal(a||{});
      if (btn.getAttribute('data-a')==='del')  deleteArticle(id);
    });
  }
  function deleteArticle(id){
    if (!id) return; if (!confirm('¿Eliminar artículo?')) return;
    var del = DB.deleteArticle || DB.removeArticle;
    if (typeof del === 'function') del(id).then(function(){ toast('Artículo eliminado'); }).catch(function(){ toast('Error al eliminar'); });
  }
  function openArticleModal(a){
    a = a||{};
    var modal = document.createElement('div');
    modal.className='modal open';
    modal.innerHTML =
      '<div class="modal-card" id="artModal">'+
        '<div class="modal-head"><div class="display-font">'+(a.id?'Editar':'Nuevo')+' artículo</div>'+
        '<button class="btn small ghost" data-close>Cerrar</button></div>'+
        '<div class="modal-body">'+
          '<div class="field"><label>Nombre</label><input id="artName" type="text" value="'+(a.name||'')+'"></div>'+
          '<div class="field"><label>Precio</label><input id="artPrice" type="number" min="0" step="0.01" value="'+(a.price||0)+'"></div>'+
          '<div class="field"><label>Activo</label>'+
            '<select id="artActive"><option value="1"'+(a.active!==false?' selected':'')+'>Sí</option><option value="0"'+(a.active===false?' selected':'')+'>No</option></select>'+
          '</div>'+
          '<div class="field"><label>Descripción</label><textarea id="artDesc">'+(a.desc||'')+'</textarea></div>'+
        '</div>'+
        '<div class="modal-foot"><div class="row" style="justify-content:flex-end; gap:8px">'+
          '<button class="btn small" data-save>Guardar</button>'+
        '</div></div>'+
      '</div>';
    document.body.appendChild(modal);
    modal.addEventListener('click', function(e){
      if ((e.target.getAttribute && e.target.getAttribute('data-close')!=null) || e.target===modal){ modal.remove(); return; }
      if (e.target.getAttribute && e.target.getAttribute('data-save')!=null){
        var name = $('#artName', modal).value.trim();
        var price = Number($('#artPrice', modal).value||0);
        var active = $('#artActive', modal).value === '1';
        var desc = $('#artDesc', modal).value.trim();
        if (!name){ toast('Nombre requerido'); return; }
        var upsert = DB.upsertArticle || DB.saveArticle;
        if (typeof upsert === 'function') upsert({ id:a.id, name:name, price:price, active:active, desc:desc })
          .then(function(){ toast('Artículo guardado'); modal.remove(); })
          .catch(function(){ toast('Error al guardar'); });
      }
    });
  }

  /* ================= HAPPY HOUR ================= */
  function populateHappyForm(hh){
    if (!hh) return;
    var e= $('#hhEnabled'); if(e) e.value = (hh.enabled ? 'on' : 'off');
    var d= $('#hhDisc');    if(d) d.value = Number(hh.discountPercent||0);
    var m= $('#hhMsg');     if(m) m.value = hh.bannerText || '';
    var du=$('#hhDurMin');  if(du) du.value = Number(hh.durationMin||0) || '';
    var ea=$('#hhEndsAt');  if(ea && hh.endsAt){
      var dt = new Date(Number(hh.endsAt||0));
      ea.value = new Date(dt.getTime() - dt.getTimezoneOffset()*60000).toISOString().slice(0,16);
    }
  }
  var btnSaveHappy = $('#btnSaveHappy');
  if (btnSaveHappy){
    btnSaveHappy.addEventListener('click', function(){
      try{
        var enabled = ( ($('#hhEnabled') && $('#hhEnabled').value) === 'on' );
        var discountPercent = Number(($('#hhDisc') && $('#hhDisc').value)||0);
        var bannerText = ( ($('#hhMsg') && $('#hhMsg').value) || '' );
        var durationMin = Number( ( $('#hhDurMin') && $('#hhDurMin').value ) || 0 ) || null;
        var endsAt = ( $('#hhEndsAt') && $('#hhEndsAt').value ) ? new Date($('#hhEndsAt').value).getTime() : null;
        var payload = { enabled:enabled, discountPercent:discountPercent, bannerText:bannerText, durationMin:durationMin, endsAt:endsAt };
        var p = (typeof DB.setHappyHour==='function') ? DB.setHappyHour(payload) : (typeof DB.updateSettings==='function' ? DB.updateSettings({ happyHour: payload }) : Promise.resolve());
        p.then(function(){ toast('Happy Hour guardado'); }).catch(function(){ toast('Error en Happy Hour'); });
      }catch(e){ console.error(e); toast('Error en Happy Hour'); }
    });
  }
  if (typeof DB.subscribeHappyHour === 'function'){
    DB.subscribeHappyHour(function(hh){
      populateHappyForm(hh);
      var pill = $('#hhCountdown'); if (!pill) return;
      if (!hh || !hh.enabled){ pill.textContent='Inactivo'; pill.className='muted small'; return; }
      function tick(){
        var endsMs = Number(hh.endsAt||0);
        var left = Math.max(0, endsMs - Date.now());
        var min = Math.floor(left/60000), sec = Math.floor((left%60000)/1000);
        pill.textContent = endsMs ? ('Activo · faltan '+ (min<10?'0':'')+min + ':' + (sec<10?'0':'')+sec) : ('Activo (-'+Number(hh.discountPercent||0)+'%)');
        pill.className = 'muted small is-running';
      }
      tick(); if (window.__admHHInt) clearInterval(window.__admHHInt); window.__admHHInt = setInterval(tick, 1000);
    });
  }

  /* ================= Bootstrap ================= */
  try { if (!$('.tabs-admin .tab.is-active')){ var first = $('.tabs-admin .tab'); first && first.click(); } } catch(e){}
  try { $('#btnRepGen') && $('#btnRepGen').click(); } catch(e){}
  try { loadHist(); } catch(e){}

})();
