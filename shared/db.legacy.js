/* ../shared/db.legacy.js — Firestore compat (ES5) con auth anónima + façade DB */

(function () {
  // Espera a que compat.js exponga firebase, db y auth
  var ready = window.__compatReady || Promise.reject(new Error('compat not loaded'));

  ready.then(function (ctx) {
    var firebase = ctx.firebase;
    var db = ctx.db;
    var auth = ctx.auth;

    /* ---------- Helpers ---------- */
    function toTs(d) { return firebase.firestore.Timestamp.fromDate(new Date(d)); }
    function startOfToday() { var d = new Date(); d.setHours(0,0,0,0); return d; }
    function toMillisFlexible(raw){
      if (raw == null) return null;
      if (typeof raw === 'number') return raw;
      if (raw && typeof raw.toMillis === 'function') return raw.toMillis();
      if (raw && raw.seconds != null) return raw.seconds*1000 + Math.floor((raw.nanoseconds||0)/1e6);
      var ms = new Date(raw).getTime(); return isFinite(ms) ? ms : null;
    }

    /* ---------- Auth anónima robusta ---------- */
    function ensureAuth(){
      return new Promise(function (resolve, reject) {
        try {
          if (!auth) return resolve(null); // en caso extremo, dejar seguir
          if (auth.currentUser) return resolve(auth.currentUser);
          // Si ya está en flujo de login, espera el cambio
          var off = auth.onAuthStateChanged(function(u){
            if (u){ try{off();}catch(_){} resolve(u); }
          });
          auth.signInAnonymously().catch(function(){ /* puede estar ya en progreso */ });
          // Salvaguarda de 4s
          setTimeout(function(){ if (auth.currentUser) resolve(auth.currentUser); }, 4000);
        } catch (e) { resolve(null); }
      });
    }

    /* ============ Façade de métodos usados por las apps ============ */
    var DB = {};

    /* ----- Catálogo ----- */
    DB.fetchCatalogWithFallback = function(){
      return ensureAuth().then(function(){
        return db.doc('settings/catalog').get().then(function(d){
          if (d.exists) return d.data();
          return db.doc('catalog/public').get().then(function(dd){
            if (dd.exists) return dd.data();
            return fetch('../data/menu.json', {cache:'no-store'}).then(function(r){
              if (r.ok) return r.json();
              return fetch('../shared/catalog.json', {cache:'no-store'}).then(function(r2){ return r2.ok ? r2.json() : {}; });
            });
          });
        });
      }).catch(function(){ return {}; });
    };

    DB.subscribeProducts = function(cb){
      DB.fetchCatalogWithFallback().then(function(cat){
        var items = []
          .concat((cat.burgers||[]).map(function(p){ return Object.assign({type:'burger'}, p); }))
          .concat((cat.minis  ||[]).map(function(p){ return Object.assign({type:'mini'},   p); }))
          .concat((cat.drinks ||[]).map(function(p){ return Object.assign({type:'drink'},  p); }))
          .concat((cat.sides  ||[]).map(function(p){ return Object.assign({type:'side'},   p); }));
        cb(items);
      });
      return function(){};
    };

    /* ----- Órdenes ----- */
    DB.createOrder = function(order, opts){
      opts = opts || {};
      if (opts.training) return Promise.resolve('TRAIN-ORDER-'+Date.now());
      var payload = Object.assign({}, order);
      var createdAtClient = Number(payload.createdAt || Date.now());
      payload.createdAt = firebase.firestore.FieldValue.serverTimestamp();
      payload.createdAtClient = createdAtClient;
      payload.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
      payload.status = String(payload.status || 'PENDING').toUpperCase();
      payload.orderMeta = {
        type: payload.orderType || (payload.orderMeta && payload.orderMeta.type) || 'pickup',
        table: payload.table || (payload.orderMeta && payload.orderMeta.table) || '',
        phone: payload.phone || (payload.orderMeta && payload.orderMeta.phone) || '',
        payMethodPref: payload.payMethodPref || (payload.orderMeta && payload.orderMeta.payMethodPref) || 'efectivo'
      };
      return ensureAuth().then(function(){ return db.collection('orders').add(payload); })
        .then(function(ref){ return ref.id; });
    };

    function _mapSnapDocs(snap){
      return snap.docs.map(function(d){ var o = d.data(); o.id = d.id; return o; });
    }

    DB.subscribeActiveOrders = function(cb, opt){
      opt = opt || {};
      var q = db.collection('orders')
        .where('createdAt','>=', toTs(startOfToday()))
        .orderBy('createdAt','desc')
        .limit(opt.limitN || 120);
      var unsub = function(){};
      ensureAuth().then(function(){
        unsub = q.onSnapshot(function(snap){ cb(_mapSnapDocs(snap)); }, function(err){ console.warn('[legacy] orders onSnapshot', err); cb([]); });
      });
      return function(){ try{unsub();}catch(_){ } };
    };
    DB.onOrdersSnapshot = DB.subscribeActiveOrders;
    DB.subscribeOrders = DB.subscribeActiveOrders;

    DB.subscribeKitchenOrders = function(cb, opt){
      var set = { PENDING:1, IN_PROGRESS:1, READY:1, DELIVERED:1 };
      return DB.subscribeActiveOrders(function(list){
        var filtered = (list||[]).filter(function(o){ return set[String(o.status||'').toUpperCase()]; });
        cb(filtered);
      }, opt);
    };

    DB.updateOrder = function(id, patch, opts){
      opts = opts || {};
      if (opts.training) return Promise.resolve({ ok:true, _training:true });
      var data = Object.assign({}, patch, { updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
      return ensureAuth().then(function(){
        return db.collection('orders').doc(String(id)).set(data, { merge:true });
      }).then(function(){ return { ok:true }; });
    };
    DB.upsertOrder = DB.updateOrder;

    DB.setOrderStatus = function(id, status, extra, opts){
      opts = opts || {}; extra = extra || {};
      if (opts.training) return Promise.resolve({ ok:true, _training:true });
      var s = String(status||'').toUpperCase();
      var now = firebase.firestore.FieldValue.serverTimestamp();
      var patch = { status:s, updatedAt: now };
      if (s==='IN_PROGRESS'){ patch.startedAt = now; patch['timestamps.startedAt'] = now; }
      if (s==='READY'){       patch.readyAt   = now; patch['timestamps.readyAt']   = now; }
      if (s==='DELIVERED'){   patch.deliveredAt = now; patch['timestamps.deliveredAt'] = now; }
      if (s==='DONE' || s==='PAID'){ patch.doneAt = now; patch['timestamps.doneAt'] = now; }
      for (var k in extra){ patch[k] = extra[k]; }
      return ensureAuth().then(function(){
        return db.collection('orders').doc(String(id)).set(patch, { merge:true });
      }).then(function(){ return { ok:true }; });
    };
    DB.setStatus = DB.setOrderStatus;

    DB.archiveDelivered = function(id, opts){
      opts = opts || {};
      if (opts.training) return Promise.resolve({ ok:true, _training:true });
      return ensureAuth().then(function(){
        var ref = db.collection('orders').doc(String(id));
        return ref.get().then(function(s){
          if (!s.exists) return { ok:false, reason:'not_found' };
          var data = s.data();
          return db.collection('orders_archive').doc(String(id)).set(
            Object.assign({}, data, { archivedAt: firebase.firestore.FieldValue.serverTimestamp() }),
            { merge:true }
          ).then(function(){ return ref.delete().catch(function(){}); })
           .then(function(){ return { ok:true }; });
        });
      });
    };

    DB.getOrdersRange = function(args){
      args = args || {};
      return ensureAuth().then(function(){
        var _from = toTs(args.from || startOfToday());
        var _to   = toTs(args.to   || new Date());
        var reads = [];
        var qMain = db.collection('orders')
          .where('createdAt','>=',_from).where('createdAt','<=',_to)
          .orderBy('createdAt','asc');
        reads.push(qMain.get());
        if (args.includeArchive){
          var qArch = db.collection('orders_archive')
            .where('createdAt','>=',_from).where('createdAt','<=',_to)
            .orderBy('createdAt','asc');
          reads.push(qArch.get());
        }
        return Promise.all(reads).then(function(snaps){
          var rows = [];
          snaps.forEach(function(s){ rows = rows.concat(_mapSnapDocs(s)); });
          if (args.orderType && args.orderType !== 'all') {
            rows = rows.filter(function(o){
              return (o.orderType === args.orderType) || (o.orderMeta && o.orderMeta.type === args.orderType);
            });
          }
          return rows;
        });
      }).catch(function(){ return []; });
    };

    /* ----- Settings (Happy Hour / Theme) ----- */
    DB.subscribeHappyHour = function(cb){
      var unsub = function(){};
      ensureAuth().then(function(){
        unsub = db.doc('settings/happyHour').onSnapshot(
          function(d){ cb(d.exists ? d.data() : null); },
          function(err){ console.warn('[legacy] happyHour onSnapshot', err); cb(null); }
        );
      });
      return function(){ try{unsub();}catch(_){ } };
    };

    DB.setHappyHour = function(payload, opts){
      opts = opts || {};
      if (opts.training) return Promise.resolve({ ok:true, _training:true });
      var durationMin = Number(payload && payload.durationMin || 0);
      var endsAtMs = (payload && payload.enabled)
        ? (durationMin>0 ? Date.now() + durationMin*60000 : toMillisFlexible(payload && payload.endsAt))
        : null;
      var normalized = {
        enabled: !!(payload && payload.enabled),
        discountPercent: Number(payload && payload.discountPercent || 0),
        bannerText: String(payload && payload.bannerText || ''),
        endsAt: endsAtMs || null,
        durationMin: durationMin>0 ? durationMin : null,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      };
      return ensureAuth().then(function(){
        return db.doc('settings/happyHour').set(normalized, { merge:true });
      }).then(function(){ return { ok:true }; });
    };

    /* ----- Inventario / Compras ----- */
    DB.subscribeInventory = function(cb){
      var unsub = function(){};
      ensureAuth().then(function(){
        unsub = db.collection('inventory').orderBy('name','asc').onSnapshot(
          function(snap){ cb(_mapSnapDocs(snap)); },
          function(err){ console.warn('[legacy] inventory onSnapshot', err); cb([]); }
        );
      });
      return function(){ try{unsub();}catch(_){ } };
    };

    DB.upsertInventoryItem = function(item, opts){
      opts = opts || {};
      if (opts.training) return Promise.resolve((item && item.id) || ('TRAIN-INV-'+Date.now()));
      return ensureAuth().then(function(){
        var ref = (item && item.id) ? db.collection('inventory').doc(item.id) : db.collection('inventory').doc();
        return ref.set(Object.assign({}, item, { updatedAt: firebase.firestore.FieldValue.serverTimestamp() }), { merge:true })
          .then(function(){ return ref.id; });
      });
    };

    DB.recordPurchase = function(purchase, opts){
      opts = opts || {};
      if (opts.training) return Promise.resolve({ ok:true, _training:true });
      return ensureAuth().then(function(){
        var itemId = purchase && purchase.itemId;
        var qty    = Number(purchase && purchase.qty || 0);
        var unitCost = Number(purchase && purchase.unitCost || 0);
        return db.collection('purchases').add(Object.assign({}, purchase, { createdAt: firebase.firestore.FieldValue.serverTimestamp() }))
          .then(function(){
            if (!(itemId && qty>0)) return { ok:true };
            var ref = db.collection('inventory').doc(String(itemId));
            return ref.get().then(function(s){
              var cur = s.exists ? Number(s.data().currentStock || 0) : 0;
              var prevCost = s.exists ? Number(s.data().costAvg || 0) : 0;
              var newStock = cur + qty;
              var newCost  = (prevCost>0 && cur>0) ? ((prevCost*cur + unitCost*qty)/newStock) : unitCost;
              return ref.set({ currentStock:newStock, costAvg:newCost, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge:true });
            }).then(function(){ return { ok:true }; });
          });
      });
    };

    /* Exponer global */
    window.DB = window.DB || DB;
    try { console.info('[db.legacy] listo (compat + auth)'); } catch (_){}
  }).catch(function (e) {
    try { console.error('[compat] Firebase no cargó', e); } catch (_){}
  });
})();
