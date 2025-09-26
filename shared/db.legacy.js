<script>
(function(){
  // Espera Firebase compat listo
  (window.__compatReady || Promise.reject('compat not loaded')).then(function(ctx){
    var db = ctx.db;

    // Helpers
    function toTs(d){ return ctx.firebase.firestore.Timestamp.fromDate(new Date(d)); }
    function startOfToday(){ var d=new Date(); d.setHours(0,0,0,0); return d; }
    function toMillisFlexible(raw){
      if (raw==null) return null;
      if (typeof raw==='number') return raw;
      if (raw && typeof raw.toMillis==='function') return raw.toMillis();
      if (raw && raw.seconds!=null) return raw.seconds*1000 + Math.floor((raw.nanoseconds||0)/1e6);
      var ms = new Date(raw).getTime(); return isFinite(ms)?ms:null;
    }

    // ============ Facade de métodos usados por tus apps ============
    var DB = {};

    // ----- Catálogo
    DB.fetchCatalogWithFallback = function(){
      return ctx.db.doc('settings/catalog').get().then(function(d){
        if (d.exists) return d.data();
        return ctx.db.doc('catalog/public').get().then(function(dd){
          if (dd.exists) return dd.data();
          return fetch('../data/menu.json', {cache:'no-store'}).then(function(r){
            if (r.ok) return r.json();
            return fetch('../shared/catalog.json', {cache:'no-store'}).then(function(r2){ return r2.ok?r2.json():{}; });
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

    // ----- Órdenes
    DB.createOrder = function(order, opts){
      opts = opts||{};
      if (opts.training) return Promise.resolve('TRAIN-ORDER-'+Date.now());
      var payload = Object.assign({}, order);
      var createdAtClient = Number(payload.createdAt||Date.now());
      payload.createdAt = ctx.firebase.firestore.FieldValue.serverTimestamp();
      payload.createdAtClient = createdAtClient;
      payload.updatedAt = ctx.firebase.firestore.FieldValue.serverTimestamp();
      payload.status = String(payload.status||'PENDING').toUpperCase();
      payload.orderMeta = {
        type: payload.orderType || (payload.orderMeta && payload.orderMeta.type) || 'pickup',
        table: payload.table || (payload.orderMeta && payload.orderMeta.table) || '',
        phone: payload.phone || (payload.orderMeta && payload.orderMeta.phone) || '',
        payMethodPref: payload.payMethodPref || (payload.orderMeta && payload.orderMeta.payMethodPref) || 'efectivo'
      };
      return ctx.db.collection('orders').add(payload).then(function(ref){ return ref.id; });
    };

    DB.subscribeActiveOrders = function(cb, opt){
      opt = opt||{};
      var q = ctx.db.collection('orders')
        .where('createdAt', '>=', toTs(startOfToday()))
        .orderBy('createdAt','desc')
        .limit(opt.limitN || 120);
      return q.onSnapshot(function(snap){
        cb(snap.docs.map(function(d){ var o=d.data(); o.id=d.id; return o; }));
      });
    };
    DB.onOrdersSnapshot = DB.subscribeActiveOrders;
    DB.subscribeOrders = DB.subscribeActiveOrders;

    DB.subscribeKitchenOrders = function(cb, opt){
      var set = {'PENDING':1,'IN_PROGRESS':1,'READY':1,'DELIVERED':1};
      return DB.subscribeActiveOrders(function(list){
        var filtered = (list||[]).filter(function(o){ return set[String(o.status||'').toUpperCase()]; });
        cb(filtered);
      }, opt);
    };

    DB.updateOrder = function(id, patch, opts){
      opts=opts||{};
      if (opts.training) return Promise.resolve({ok:true,_training:true});
      var data = Object.assign({}, patch, { updatedAt: ctx.firebase.firestore.FieldValue.serverTimestamp() });
      return ctx.db.collection('orders').doc(String(id)).set(data, { merge:true }).then(function(){ return {ok:true}; });
    };
    DB.upsertOrder = DB.updateOrder;

    DB.setOrderStatus = function(id, status, extra, opts){
      opts=opts||{}; extra=extra||{};
      if (opts.training) return Promise.resolve({ok:true,_training:true});
      var s = String(status||'').toUpperCase();
      var patch = { status:s, updatedAt: ctx.firebase.firestore.FieldValue.serverTimestamp() };
      if (s==='IN_PROGRESS'){ patch.startedAt = ctx.firebase.firestore.FieldValue.serverTimestamp(); patch['timestamps.startedAt']=ctx.firebase.firestore.FieldValue.serverTimestamp(); }
      if (s==='READY'){ patch.readyAt = ctx.firebase.firestore.FieldValue.serverTimestamp(); patch['timestamps.readyAt']=ctx.firebase.firestore.FieldValue.serverTimestamp(); }
      if (s==='DELIVERED'){ patch.deliveredAt = ctx.firebase.firestore.FieldValue.serverTimestamp(); patch['timestamps.deliveredAt']=ctx.firebase.firestore.FieldValue.serverTimestamp(); }
      if (s==='DONE' || s==='PAID'){ patch.doneAt = ctx.firebase.firestore.FieldValue.serverTimestamp(); patch['timestamps.doneAt']=ctx.firebase.firestore.FieldValue.serverTimestamp(); }
      Object.assign(patch, extra||{});
      return ctx.db.collection('orders').doc(String(id)).set(patch, { merge:true }).then(function(){ return {ok:true}; });
    };
    DB.setStatus = DB.setOrderStatus;

    DB.archiveDelivered = function(id, opts){
      opts=opts||{};
      if (opts.training) return Promise.resolve({ok:true,_training:true});
      var ref = ctx.db.collection('orders').doc(String(id));
      return ref.get().then(function(s){
        if (!s.exists) return {ok:false, reason:'not_found'};
        var data = s.data();
        return ctx.db.collection('orders_archive').doc(String(id)).set(
          Object.assign({}, data, { archivedAt: ctx.firebase.firestore.FieldValue.serverTimestamp() }),
          { merge:true }
        ).then(function(){ return ref.delete().catch(function(){}); }).then(function(){ return {ok:true}; });
      });
    };

    DB.getOrdersRange = function(args){
      args=args||{};
      var _from = toTs(args.from||startOfToday());
      var _to   = toTs(args.to  ||new Date());
      var reads = [];
      var qMain = ctx.db.collection('orders')
        .where('createdAt','>=',_from).where('createdAt','<=',_to)
        .orderBy('createdAt','asc');
      reads.push(qMain.get());
      if (args.includeArchive){
        var qArch = ctx.db.collection('orders_archive')
          .where('createdAt','>=',_from).where('createdAt','<=',_to)
          .orderBy('createdAt','asc');
        reads.push(qArch.get());
      }
      return Promise.all(reads).then(function(snaps){
        var rows = [];
        snaps.forEach(function(s){ s.docs.forEach(function(d){ var o=d.data(); o.id=d.id; rows.push(o); }); });
        if (args.orderType && args.orderType!=='all') {
          rows = rows.filter(function(o){
            return (o.orderType===args.orderType) || (o.orderMeta && o.orderMeta.type===args.orderType);
          });
        }
        return rows;
      }).catch(function(){ return []; });
    };

    // ----- Settings (Happy Hour / Theme)
    DB.subscribeHappyHour = function(cb){
      return ctx.db.doc('settings/happyHour').onSnapshot(function(d){ cb(d.exists? d.data() : null); });
    };
    DB.setHappyHour = function(payload, opts){
      opts=opts||{};
      if (opts.training) return Promise.resolve({ok:true,_training:true});
      var durationMin = Number(payload && payload.durationMin || 0);
      var endsAtMs = (payload && payload.enabled)
        ? (durationMin>0 ? Date.now()+durationMin*60000 : toMillisFlexible(payload && payload.endsAt))
        : null;
      var normalized = {
        enabled: !!(payload && payload.enabled),
        discountPercent: Number(payload && payload.discountPercent || 0),
        bannerText: String(payload && payload.bannerText || ''),
        endsAt: endsAtMs || null,
        durationMin: durationMin>0 ? durationMin : null,
        updatedAt: ctx.firebase.firestore.FieldValue.serverTimestamp()
      };
      return ctx.db.doc('settings/happyHour').set(normalized, { merge:true }).then(function(){ return {ok:true}; });
    };

    // ----- Inventario / Compras
    DB.subscribeInventory = function(cb){
      return ctx.db.collection('inventory').orderBy('name','asc').onSnapshot(function(snap){
        cb(snap.docs.map(function(d){ var o=d.data(); o.id=d.id; return o; }));
      });
    };
    DB.upsertInventoryItem = function(item, opts){
      opts=opts||{};
      if (opts.training) return Promise.resolve(item && item.id || ('TRAIN-INV-'+Date.now()));
      var ref = item && item.id ? ctx.db.collection('inventory').doc(item.id) : ctx.db.collection('inventory').doc();
      return ref.set(Object.assign({}, item, { updatedAt: ctx.firebase.firestore.FieldValue.serverTimestamp() }), { merge:true })
        .then(function(){ return ref.id; });
    };
    DB.recordPurchase = function(purchase, opts){
      opts=opts||{};
      if (opts.training) return Promise.resolve({ok:true,_training:true});
      var itemId = purchase && purchase.itemId;
      var qty    = Number(purchase && purchase.qty || 0);
      var unitCost = Number(purchase && purchase.unitCost || 0);
      return ctx.db.collection('purchases').add(Object.assign({}, purchase, { createdAt: ctx.firebase.firestore.FieldValue.serverTimestamp() }))
      .then(function(){
        if (!(itemId && qty>0)) return {ok:true};
        var ref = ctx.db.collection('inventory').doc(String(itemId));
        return ref.get().then(function(s){
          var cur = s.exists ? Number(s.data().currentStock||0) : 0;
          var prevCost = s.exists ? Number(s.data().costAvg||0) : 0;
          var newStock = cur + qty;
          var newCost  = (prevCost>0 && cur>0) ? ((prevCost*cur + unitCost*qty)/newStock) : unitCost;
          return ref.set({ currentStock:newStock, costAvg:newCost, updatedAt: ctx.firebase.firestore.FieldValue.serverTimestamp() }, { merge:true });
        }).then(function(){ return {ok:true}; });
      });
    };

    // Exponer global
    window.DB = window.DB || DB;
    console.info('[db.legacy] listo (compat)');
  }).catch(function(e){
    console.error('[compat] Firebase no cargó', e);
  });
})();
</script>
